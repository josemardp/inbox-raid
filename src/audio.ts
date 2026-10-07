import { ZZFX, zzfx } from 'zzfx';

// Sound effects are ZzFX parameter lists, generated in code (no audio files, no licensing).
type Params = (number | undefined)[];

// Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise. No white noise and no bitcrush:
// they made the mix hiss. Rounder waves, a little noise only for texture.
const SFX: Record<string, Params> = {
  hit: [1, 0.05, 300, 0.01, 0.03, 0.14, 1, 1.2, -6, , , , , 0.15, , , , 0.7, 0.05],
  trash: [1.1, 0.05, 150, 0.01, 0.08, 0.32, 3, 1, -9, , , , , 0.25, , , 0.04, 0.6, 0.1],
  boom: [1.8, 0.05, 62, 0.02, 0.25, 0.8, 0, 1.4, -2, , , , , 0.5, , , 0.1, 0.5, 0.2],
  coin: [0.8, 0.05, 820, , 0.03, 0.2, 1, 1.5, , , 420, 0.05],
  boss: [1.2, 0, 110, 0.05, 0.3, 0.4, 1, 1, -1, , , , 0.08],
  overload: [1.2, 0.1, 200, 0.05, 0.2, 0.35, 3, 1.6, -10, , , , , , 12],
  tick: [0.28, 0, 1100, 0.002, 0.01, 0.02, 0, 1],
  select: [0.5, 0, 620, , 0.01, 0.05, 1],
  undo: [0.7, 0, 200, , 0.05, 0.12, 1, 1, 8],
  spare: [0.6, 0, 400, 0.02, 0.05, 0.15, 0, 1, 2],
};

let muted = false;
try { muted = localStorage.getItem('inbox-raid-muted') === '1'; } catch { /* storage blocked */ }

export function isMuted() { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('inbox-raid-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
  master.gain.value = muted ? 0 : 0.9;
  if (muted) music.stop();
  return muted;
}

/** Browsers start audio suspended; call on the first key or click. */
export function unlockAudio() {
  if (ZZFX.audioContext.state !== 'running') ZZFX.audioContext.resume();
}

/** Every sound goes through here, so a recorder (see recorder.ts) can listen in. */
function play(p: Params) {
  const src = zzfx(...p) as AudioBufferSourceNode & { gainNode?: GainNode };
  if (tap && src.gainNode) src.gainNode.connect(tap);
}

let tap: AudioNode | null = null;

/** Sends all game audio (effects and music) to an extra node, e.g. a recorder. */
export function setAudioTap(node: AudioNode | null) {
  if (tap) master.disconnect(tap);
  tap = node;
  if (tap) master.connect(tap);
}

export const audioContext = ZZFX.audioContext;

export function sfx(name: keyof typeof SFX, pitch = 1) {
  if (muted) return;
  const p = [...SFX[name]];
  if (pitch !== 1 && typeof p[2] === 'number') p[2] = p[2] * pitch;
  play(p);
}

export function comboSfx(combo: number) {
  if (muted) return;
  play([0.8, 0, 440 + combo * 90, , 0.02, 0.1, 1, 1, , , 200, 0.03]);
}

/** Rapid ticks while a boss HP bar drains. */
export function drainSfx(count: number, ms: number) {
  if (muted) return;
  const n = Math.min(14, Math.max(4, Math.round(count / 6)));
  for (let i = 0; i < n; i++) setTimeout(() => sfx('tick', 1 + i * 0.06), (ms / n) * i);
}

export function fanfare() {
  if (muted) return;
  [0, 4, 7, 12, 16].forEach((semi, i) =>
    setTimeout(() => play([0.9, 0, 523 * 2 ** (semi / 12), 0.01, 0.08, 0.25, 1, 1.2]), i * 110));
}

// --- Chiptune loop -------------------------------------------------------
// Am F C G, square bass + triangle arpeggio, scheduled ahead on the WebAudio clock.

const ctx = ZZFX.audioContext;
const master = ctx.createGain();
master.gain.value = muted ? 0 : 0.9;
master.connect(ctx.destination);
// The music runs through a gentle low-pass, so the square bass sounds warm, not buzzy.
const musicBus = ctx.createBiquadFilter();
musicBus.type = 'lowpass';
musicBus.frequency.value = 2600;
musicBus.Q.value = 0.5;
musicBus.connect(master);

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

function note(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  // A 5 ms fade-in: an instant start clicks across the whole spectrum.
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(musicBus);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(start);
  o.stop(start + dur + 0.02);
}

class Music {
  private timer = 0;
  private step = 0;
  private nextAt = 0;
  bpm = 132;

  get playing() { return this.timer !== 0; }

  start(bpm = this.bpm) {
    this.bpm = bpm;
    if (muted || this.timer) return;
    this.nextAt = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule() {
    if (document.hidden) return; // nobody is listening; resumes from now when the tab is back
    const sixteenth = 60 / this.bpm / 4;
    // After a hidden or frozen tab, skip the missed notes instead of playing them all at once.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 16) % 4;
      const s = this.step % 16;
      const chord = CHORDS[bar];
      if (s % 4 === 0) note(midi(chord[0] - 24 + (s === 8 ? 12 : 0)), this.nextAt, sixteenth * 3, 'square', 0.07);
      if (s % 2 === 0) note(midi(chord[(s / 2) % 3] + 12), this.nextAt, sixteenth * 1.5, 'triangle', 0.06);
      // A soft low pulse on the beat instead of a bright click.
      if (s % 4 === 0) note(58, this.nextAt, 0.12, 'sine', 0.09);
      this.nextAt += sixteenth;
      this.step++;
    }
  }
}

export const music = new Music();
