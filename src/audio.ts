import { ZZFX, zzfx } from 'zzfx';
import { BPM, makeNoise, playStep, type Level, type Section, type Voices } from './score';

const NO_MUSIC = new URLSearchParams(location.search).has('nomusic');
const OPEN_HZ = 14000;
const CLOSED_HZ = 900;

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

// --- Soundtrack ----------------------------------------------------------
// The notes live in score.ts; this schedules them ahead on the WebAudio clock.

const ctx = ZZFX.audioContext;
const master = ctx.createGain();
master.gain.value = muted ? 0 : 0.9;
master.connect(ctx.destination);
// Stress closes this filter: under pressure the whole song goes muffled, as if underwater.
const pressure = ctx.createBiquadFilter();
pressure.type = 'lowpass';
pressure.frequency.value = OPEN_HZ;
pressure.Q.value = 0.7;
pressure.connect(master);
// Melodic parts run through a gentle low-pass, so the square bass sounds warm, not buzzy.
const warm = ctx.createBiquadFilter();
warm.type = 'lowpass';
warm.frequency.value = 3400;
warm.Q.value = 0.5;
warm.connect(pressure);
const voices: Voices = { ctx, tone: warm, dry: pressure, noise: makeNoise(ctx) };

class Music {
  private timer = 0;
  private step = 0;
  private nextAt = 0;
  section: Section = 'boss';
  private level: Level = 1;

  get playing() { return this.timer !== 0; }
  get bpm() { return BPM[this.section]; }

  start(section = this.section) {
    // ?nomusic: effects only, for a video that brings its own soundtrack.
    if (NO_MUSIC) return;
    if (this.timer && section !== this.section) this.stop();
    this.section = section;
    if (muted || this.timer) return;
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  /** Layers earned by the combo join on the next sixteenth. */
  setLevel(level: Level) { this.level = level; }

  /** 0..1: how much the stress muffles the song. */
  setPressure(p: number) {
    const hz = OPEN_HZ * (CLOSED_HZ / OPEN_HZ) ** Math.min(1, Math.max(0, p));
    if (Math.abs(hz - this.hz) / this.hz < 0.03) return;
    this.hz = hz;
    pressure.frequency.setTargetAtTime(hz, ctx.currentTime, 0.12);
  }
  private hz = OPEN_HZ;

  private schedule() {
    if (document.hidden) return; // nobody is listening; resumes from now when the tab is back
    // After a hidden or frozen tab, skip the missed notes instead of playing them all at once.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + 0.12) {
      playStep(voices, this.nextAt, this.step, this.section, this.level);
      this.nextAt += 60 / BPM[this.section] / 4;
      this.step++;
    }
  }
}

export const music = new Music();
