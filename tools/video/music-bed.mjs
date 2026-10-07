// Renders the game's chiptune loop alone (no effects) to a WAV, for quiet stretches of the video.
// Same notes, waves, filter and envelope as src/audio.ts.
//   node tools/video/music-bed.mjs <out.wav> [seconds] [bpm]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const [out, secs = '60', bpm = '132'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
const wav = await p.evaluate(async ({ secs, bpm }) => {
  const sr = 48000, len = Math.ceil(secs * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const bus = ctx.createBiquadFilter(); bus.type = 'lowpass'; bus.frequency.value = 2600; bus.Q.value = 0.5; bus.connect(master);
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const note = (freq, start, dur, type, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start); g.gain.linearRampToValueAtTime(vol, start + 0.005); g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(bus); o.start(start); o.stop(start + dur + 0.02);
  };
  const sixteenth = 60 / bpm / 4;
  for (let step = 0, t = 0.05; t < secs - 0.2; step++, t += sixteenth) {
    const chord = CHORDS[Math.floor(step / 16) % 4], s = step % 16;
    if (s % 4 === 0) note(midi(chord[0] - 24 + (s === 8 ? 12 : 0)), t, sixteenth * 3, 'square', 0.07);
    if (s % 2 === 0) note(midi(chord[(s / 2) % 3] + 12), t, sixteenth * 1.5, 'triangle', 0.06);
    if (s % 4 === 0) note(58, t, 0.12, 'sine', 0.09);
  }
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const data = new DataView(new ArrayBuffer(44 + len * 4));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * 4, true);
  for (let i = 0; i < len; i++) for (let c = 0; c < 2; c++) data.setInt16(44 + (i * 2 + c) * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
  return Array.from(new Uint8Array(data.buffer));
}, { secs: Number(secs), bpm: Number(bpm) });
fs.writeFileSync(out, Buffer.from(wav));
await b.close();
console.log('wrote', out);
