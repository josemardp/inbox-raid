import { ZZFX, zzfx } from 'zzfx';

// Sound effects are ZzFX parameter lists, generated in code (no audio files, no licensing).
type Params = (number | undefined)[];

const SFX: Record<string, Params> = {
  hit: [1.1, 0.05, 320, 0.01, 0.02, 0.15, 2, 1.5, -5, , , , , 1.2, , 0.1, , 0.7, 0.05],
  trash: [1.4, 0.1, 90, 0.01, 0.1, 0.4, 4, 2, , , , , , 1.2, , 0.6, 0.1, 0.5, 0.1],
  boom: [2, 0.1, 55, 0.03, 0.3, 0.9, 4, 1.5, , , , , , 2, , 0.8, 0.2, 0.4, 0.2],
  coin: [0.9, 0.05, 820, , 0.03, 0.2, 1, 1.5, , , 420, 0.05],
  boss: [1.4, 0, 110, 0.05, 0.3, 0.4, 2, 1, -1, , , , 0.08],
  overload: [1.4, 0.1, 220, 0.05, 0.2, 0.35, 3, 2, -10, , , , , , 20],
  tick: [0.35, 0, 1300, , 0.01, 0.02, 1, 0],
  select: [0.6, 0, 620, , 0.01, 0.05, 1],
  undo: [0.8, 0, 200, , 0.05, 0.12, 1, 1, 8],
  spare: [0.7, 0, 400, 0.02, 0.05, 0.15, 0, 1, 2],
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

export function sfx(name: keyof typeof SFX, pitch = 1) {
  if (muted) return;
  const p = [...SFX[name]];
  if (pitch !== 1 && typeof p[2] === 'number') p[2] = p[2] * pitch;
  zzfx(...(p as number[]));
}

export function comboSfx(combo: number) {
  if (muted) return;
  zzfx(...[0.8, 0, 440 + combo * 90, , 0.02, 0.1, 1, 1, , , 200, 0.03]);
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
    setTimeout(() => zzfx(0.9, 0, 523 * 2 ** (semi / 12), 0.01, 0.08, 0.25, 1, 1.2), i * 110));
}

// --- Chiptune loop -------------------------------------------------------
// Am F C G, square bass + triangle arpeggio, scheduled ahead on the WebAudio clock.

const ctx = ZZFX.audioContext;
const master = ctx.createGain();
master.gain.value = muted ? 0 : 0.9;
master.connect(ctx.destination);

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

function note(freq: number, start: number, dur: number, type: OscillatorType, vol: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

class Music {
  private timer = 0;
  private step = 0;
  private nextAt = 0;
  bpm = 132;

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
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 16) % 4;
      const s = this.step % 16;
      const chord = CHORDS[bar];
      if (s % 4 === 0) note(midi(chord[0] - 24 + (s === 8 ? 12 : 0)), this.nextAt, sixteenth * 3, 'square', 0.07);
      if (s % 2 === 0) note(midi(chord[(s / 2) % 3] + 12), this.nextAt, sixteenth * 1.5, 'triangle', 0.06);
      if (s % 8 === 4) note(1800, this.nextAt, 0.03, 'square', 0.015);
      this.nextAt += sixteenth;
      this.step++;
    }
  }
}

export const music = new Music();
