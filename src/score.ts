// The soundtrack, written as code: no audio files, no licence, and it reacts to the raid.
// Two sections (a tense boss theme, a driving horde theme) and layers that join as the combo
// climbs. Works on any AudioContext, so the same notes can be rendered offline for a preview.

export type Section = 'boss' | 'horde';

/** 0 bare groove · 1 hi-hats · 2 lead melody · 3 everything, lead an octave up. */
export type Level = 0 | 1 | 2 | 3;

export interface Voices {
  ctx: BaseAudioContext;
  /** Melodic parts go through a warm low-pass. */
  tone: AudioNode;
  /** Drums skip it, so the hats stay crisp. */
  dry: AudioNode;
  noise: AudioBuffer;
}

export const BPM: Record<Section, number> = { boss: 132, horde: 152 };

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Boss: A minor with an E major turn for menace. Horde: the classic Am F C G lift.
const CHORDS: Record<Section, number[][]> = {
  boss: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
  horde: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
};

// The horde hook, one bar per chord: [step, note, length in sixteenths].
const HOOK: [number, number, number][][] = [
  [[0, 69, 2], [3, 72, 1], [4, 76, 2], [6, 74, 1], [7, 72, 2], [10, 69, 2], [13, 67, 1], [14, 69, 2]],
  [[0, 65, 2], [3, 69, 1], [4, 72, 2], [6, 74, 1], [7, 72, 2], [10, 69, 4], [14, 67, 2]],
  [[0, 67, 2], [3, 72, 1], [4, 76, 2], [6, 79, 2], [8, 76, 2], [10, 74, 2], [12, 72, 2], [14, 74, 2]],
  [[0, 74, 3], [3, 71, 1], [4, 67, 2], [6, 71, 2], [8, 74, 4], [12, 76, 1], [13, 74, 1], [14, 71, 2]],
];

// The boss stalks: a two-note warning on the last beat of each bar, higher on the E chord.
const WARN: [number, number, number][][] = [
  [[12, 76, 1], [14, 77, 2]],
  [[12, 76, 1], [14, 72, 2]],
  [[12, 77, 1], [14, 76, 2]],
  [[12, 80, 1], [13, 81, 1], [14, 80, 2]],
];

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return buf;
}

function tone(v: Voices, freq: number, at: number, dur: number, type: OscillatorType, vol: number, detune = 0) {
  const o = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  // A 5 ms fade-in: an instant start clicks across the whole spectrum.
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(v.tone);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(at);
  o.stop(at + dur + 0.02);
}

function kick(v: Voices, at: number, vol = 0.13) {
  const o = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(190, at);
  o.frequency.exponentialRampToValueAtTime(48, at + 0.1);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
  o.connect(g).connect(v.dry);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(at);
  o.stop(at + 0.3);
  // A short click on top, so small speakers that cannot play the thump still hear the beat.
  hiss(v, at, 0.012, vol * 0.25, 'bandpass', 3200);
}

function hiss(v: Voices, at: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
  const s = v.ctx.createBufferSource();
  s.buffer = v.noise;
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f).connect(g).connect(v.dry);
  s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  // A different slice of the noise each time, so repeated hits do not sound identical.
  s.start(at, (at * 7.31) % 0.8, dur + 0.02);
}

function snare(v: Voices, at: number, vol = 0.1) {
  hiss(v, at, 0.16, vol, 'bandpass', 1800);
  const o = v.ctx.createOscillator();
  const g = v.ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, at);
  o.frequency.exponentialRampToValueAtTime(160, at + 0.08);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol * 0.6, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
  o.connect(g).connect(v.dry);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(at);
  o.stop(at + 0.12);
}

const hat = (v: Voices, at: number, open = false, accent = false) =>
  hiss(v, at, open ? 0.14 : 0.035, (accent ? 0.045 : 0.032) * (open ? 0.8 : 1), 'highpass', 7500);

/** Schedules one sixteenth note of the soundtrack at time `at`. `step` counts from the start. */
export function playStep(v: Voices, at: number, step: number, section: Section, level: Level) {
  const sixteenth = 60 / BPM[section] / 4;
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  const chord = CHORDS[section][bar];
  const root = chord[0] - 24;

  if (section === 'boss') {
    // Half-time stomp: kick on 1 and the "and" of 2, snare on 3.
    if (s === 0 || s === 6 || s === 10) kick(v, at);
    if (s === 8) snare(v, at);
    if (level >= 1 && s % 2 === 0) hat(v, at, false, s % 4 === 0);
    // Pulsing bass on every eighth, octave jump on the off-beats.
    if (s % 2 === 0) tone(v, midi(root + (s % 4 === 2 ? 12 : 0)), at, sixteenth * 1.6, 'square', 0.045);
    // A low drone under the bar.
    if (s === 0) tone(v, midi(root - 12), at, sixteenth * 15, 'sawtooth', 0.03);
    // Arpeggio climbing the chord.
    tone(v, midi(chord[s % 3] + 12), at, sixteenth * 0.9, 'triangle', 0.05);
    for (const [st, n, len] of WARN[bar]) if (st === s) tone(v, midi(n), at, sixteenth * len * 0.95, 'square', 0.045);
    return;
  }

  // Horde: four on the floor.
  if (s % 4 === 0) kick(v, at);
  if (s === 4 || s === 12) snare(v, at);
  if (level >= 1 && s % 2 === 0) hat(v, at, level >= 3 && s % 4 === 2, s % 4 === 2);
  if (level >= 2 && s % 2 === 1) hat(v, at);
  // Driving octave bass on eighths.
  if (s % 2 === 0) tone(v, midi(root + (s % 4 === 2 ? 12 : 0)), at, sixteenth * 1.7, 'square', 0.045);
  // Sixteenth arpeggio up and down the chord.
  const arp = [0, 1, 2, 1][s % 4];
  tone(v, midi(chord[arp] + 12 + (s >= 8 && arp === 2 ? 12 : 0)), at, sixteenth * 0.85, 'triangle', 0.05);
  if (level >= 2) {
    const up = level >= 3 ? 12 : 0;
    for (const [st, n, len] of HOOK[bar]) {
      if (st !== s) continue;
      // Two detuned saws: a wide, warm synth lead.
      tone(v, midi(n + up), at, sixteenth * len * 0.95, 'sawtooth', 0.04, -7);
      tone(v, midi(n + up), at, sixteenth * len * 0.95, 'sawtooth', 0.04, 7);
    }
  }
}

/** The horde layer that a combo has earned. */
export function levelFor(combo: number): Level {
  return combo >= 8 ? 3 : combo >= 4 ? 2 : combo >= 2 ? 1 : 0;
}
