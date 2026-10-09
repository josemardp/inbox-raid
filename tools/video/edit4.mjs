// The demo video, v4: the v3 hook and real Gmail raid (cut tighter), a fresh demo take of the
// current game, and one licensed soundtrack under everything. The raw real take is gone, so
// its part comes from the published v3 file, captions included.
//   node tools/video/edit4.mjs <demo take> <v3.mp4> <music> <music start s> <out.mp4>
// The demo take is a raid-bot output recorded with ?rec&nomusic (effects only) plus base.mp4.
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontUrl = (p) => pathToFileURL(path.join(ROOT, 'node_modules/@fontsource', p)).href;
const [demoDir, V3, MUSIC, musicAtArg, OUTF] = process.argv.slice(2);
const MUSIC_AT = Number(musicAtArg || 0);
const work = path.join(path.dirname(path.resolve(OUTF)), 'edit4');
const run = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
// REMIX=1: keep the rendered picture and effects, only lay a different soundtrack.
if (process.env.REMIX) {
  const saved = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
  mix(saved.L, saved.fx, saved.audio);
  process.exit(0);
}
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// ---------- the demo take ----------
const frames = JSON.parse(fs.readFileSync(path.join(demoDir, 'frames.json'), 'utf8'));
const events = JSON.parse(fs.readFileSync(path.join(demoDir, 'events.json'), 'utf8'));
const T0 = frames[0].t;
const at = (e) => (e.t - T0) / 1000;
const all = (fn) => events.filter(fn).map(at);
const must = (v, what) => { if (v === undefined || Number.isNaN(v)) throw new Error(`missing ${what}`); return v; };
const stamp = (text) => all((e) => e.type === 'stamp' && e.text === text);
const D = {
  base: path.join(demoDir, 'base.mp4'),
  audio: path.join(demoDir, 'inbox-raid-audio.webm'),
  fight: must(stamp('FIGHT!')[0], 'FIGHT!'),
};
const dKey = must(all((e) => e.type === 'key' && e.what === 'demo')[0], 'demo key');
const dCrit = must(stamp('CRITICAL HIT!')[0], 'crit');
const dTrash = must(stamp('TRASHED!')[0], 'trashed');
const dHorde = must(stamp('HORDE INCOMING!')[0], 'horde');
const dBrief = must(all((e) => e.type === 'brief-open')[0], 'brief');
const dDraft = must(all((e) => e.type === 'draft-saved')[0], 'draft');
const dBriefEnd = must(all((e) => e.type === 'brief-closed')[0], 'brief end');
const dClear = must(all((e) => e.type === 'clear')[0], 'clear');

// ---------- graphics ----------
const css = `
@font-face{font-family:SG;font-weight:700;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-700-normal.woff2')})}
@font-face{font-family:SG;font-weight:500;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-500-normal.woff2')})}
@font-face{font-family:DM;font-weight:500;src:url(${fontUrl('dm-mono/files/dm-mono-latin-500-normal.woff2')})}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent;font-family:SG}`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let pngN = 0;
async function png(html, transparent = true) {
  const name = `g${String(++pngN).padStart(2, '0')}`;
  const htmlFile = path.join(work, `${name}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}
const NAVY = '#0b1430', CYAN = '#75dbf3', CORAL = '#ff6e67', GOLD = '#ffd35c', WHITE = '#f4f8fd';
const hi = (s, col = CYAN) => `<b style="color:${col}">${s}</b>`;
// opaque: covers a caption already burned into a v3 frame.
const cap = (text, color = CYAN, opaque = false) => png(`
  <div style="position:absolute;left:0;right:0;bottom:0;padding:26px 60px 30px;background:${NAVY}${opaque ? '' : 'f5'};border-top:6px solid ${color};display:flex;justify-content:center">
    <p style="max-width:1760px;color:${WHITE};font:700 56px/1.18 SG;text-align:center;text-wrap:balance">${text}</p></div>`);
const chip = (text, color) => png(`
  <div style="position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:12px 22px;background:${NAVY}f5;border:4px solid ${color};color:${color};font:700 36px DM;letter-spacing:.08em;white-space:nowrap">${text}</div>`);
const tag = (text, color = GOLD, top = 120) => png(`
  <div style="position:absolute;right:30px;top:${top}px;padding:10px 18px;background:${NAVY}f5;border:3px solid ${color};color:${color};font:700 30px DM;letter-spacing:.08em">${text}</div>`);

const CH = { demo: await chip('DEMO · FAKE INBOX · NO LOGIN', GOLD) };
const TAG = {
  x15: await tag('1.5× SPEED'),
  restored: await tag('194 OF 202 RESTORED FROM TRASH FOR THIS TAKE', CORAL, 200),
};
const C = {
  d1: await cap(`Try the demo first: ${hi('no login')}, fake emails.`, GOLD),
  d2: await cap(`Senders who flood you become ${hi('bosses', CORAL)}.<br>HP = how many emails they sent.`, CORAL),
  d3: await cap(`${hi('U')} sends an unsubscribe request: ${hi('critical hit', GOLD)}.`, GOLD),
  d4: await cap(`Every other email lands on the ${hi('triage board')}.`),
  d5a: await cap(`${hi('ACT')} reads the email and suggests a reply.`),
  d5b: await cap(`In the demo, the draft is only a ${hi('pretend preview', GOLD)}.`, GOLD),
  d6: await cap(`Fast calls build the combo. ${hi('Risky ones get flagged', CORAL)}.`, GOLD),
  d7: await cap(`Inbox zero, medals, and ${hi('what may still need you', GOLD)}.`, GOLD),
  r1: await cap(`Now my ${hi('real Gmail', CORAL)}, privacy on: 202 emails.`, CORAL, true),
};
const END = await png(`
  <div style="width:1920px;height:1080px;background:radial-gradient(circle at 18% 22%,#1f8bff38,transparent 36%),#0a1024;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center">
    <p style="color:${GOLD};font:700 64px SG;letter-spacing:.02em">PLAY THE DEMO · NO LOGIN</p>
    <p style="color:${WHITE};font:700 92px SG;letter-spacing:-.01em">josemardp.github.io/<span style="color:${CYAN}">inbox-raid</span></p>
    <p style="color:#c7d2e6;font:500 34px SG;line-height:1.5;max-width:1500px">Real Gmail mode is open only to invited test accounts<br>while Google reviews the app. No server: it runs in your browser.</p>
    <p style="color:${CYAN};font:700 44px SG">Like it? Vote for INBOX RAID on Hackyard ★</p>
    <p style="color:#8fa0c2;font:500 28px DM;letter-spacing:.06em">Built solo with Claude Code · Hackyard Yard #4</p>
  </div>`, false);
await browser.close();

// ---------- segments ----------
const ENC = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const segs = [];
let tOut = 0;
/** Effects from the demo take placed on the timeline: [{from, to, at}] (take seconds, output seconds). */
const fx = [];

function curve(keys) {
  const t = '(in/30)';
  let e = `${keys[0].v}`;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (b.v === a.v) continue;
    const p = `clip((${t}-${a.t})/${Math.max(0.01, b.t - a.t)},0,1)`;
    e += `+(${b.v - a.v})*(${p})*(${p})*(3-2*(${p}))`;
  }
  return e;
}
function zoomFilter(keys) {
  if (!keys) return '';
  const z = curve(keys.map((k) => ({ t: k.t, v: k.z })));
  const cx = curve(keys.map((k) => ({ t: k.t, v: k.x })));
  const cy = curve(keys.map((k) => ({ t: k.t, v: k.y })));
  return `,zoompan=z='${z}':x='clip((${cx})-iw/zoom/2,0,iw-iw/zoom)':y='clip((${cy})-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1920x1080:fps=30`;
}
const Z = (t, z, x = 960, y = 540) => ({ t, z, x, y });

/** Video only; the sound is laid out later on one timeline. */
function seg(name, src, { dur, speed = 1, zoom, overlays = [], fadeOutV = 0, sfx = true }) {
  const inputs = [];
  let out;
  let vin;
  if (src.image) {
    out = dur;
    inputs.push('-loop', '1', '-framerate', '30', '-t', out.toFixed(3), '-i', src.image);
    vin = '[0:v]scale=1920:1080,setsar=1,format=yuv420p';
  } else {
    out = (src.to - src.from) / speed;
    inputs.push('-ss', src.from.toFixed(3), '-t', (src.to - src.from).toFixed(3), '-i', src.file);
    vin = '[0:v]setsar=1';
  }
  overlays.forEach((o) => inputs.push('-i', o.file));
  let v = `${vin}${zoomFilter(zoom)},setpts=(PTS-STARTPTS)/${speed}[z0]`;
  let last = 'z0';
  overlays.forEach((o, i) => {
    v += `;[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${Math.max(0, o.from).toFixed(2)},${Math.min(out, o.to).toFixed(2)})'[o${i}]`;
    last = `o${i}`;
  });
  if (fadeOutV) { v += `;[${last}]fade=out:st=${(out - fadeOutV).toFixed(2)}:d=${fadeOutV}[vf]`; last = 'vf'; }
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-f', 'lavfi', '-t', out.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', v, '-map', `[${last}]`, '-map', `${overlays.length + 1}:a`, '-t', out.toFixed(3), ...ENC, file]);
  // The demo take's own effects, sped up with the picture when it is.
  if (sfx && src.file === D.base && src.to > D.fight) {
    const from = Math.max(src.from, D.fight);
    fx.push({ from: from - D.fight, to: src.to - D.fight, at: tOut + (from - src.from) / speed, tempo: speed });
  }
  segs.push({ name, file, out, start: tOut });
  tOut += out;
  console.log(name.padEnd(12), out.toFixed(2), 's');
  return out;
}
const DEMO = (from, to) => ({ file: D.base, from, to });
const OLD = (from, to) => ({ file: V3, from, to });
/** A single effect from the demo take, dropped at a moment of a v3 segment. */
const hitFx = (takeAt, before, after, outAt) => fx.push({ from: takeAt - D.fight - before, to: takeAt - D.fight + after, at: outAt - before });

// 1. Hook, as published in v3: the real scan and the real 202 -> 0.
seg('h1-hook', OLD(0, 5.6), {});

// 2. The demo, freshly recorded.
seg('d1-title', DEMO(dKey - 2.2, dKey + 0.2), { overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d1, from: 0, to: 9 }] });
seg('d2-boss', DEMO(D.fight - 0.3, dCrit - 0.75), {
  zoom: [Z(0, 1.0), Z(0.8, 1.25, 1120, 480)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d2, from: 0, to: 9 }],
});
seg('d3-crit', DEMO(dCrit - 0.75, dHorde - 0.9), {
  zoom: [Z(0, 1.25, 1120, 480), Z(0.6, 1.0)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d3, from: 0, to: 9 }],
});
seg('d4-board', DEMO(dHorde - 0.9, dBrief), {
  zoom: [Z(0, 1.0), Z(1.6, 1.2, 1000, 600)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d4, from: 0, to: 9 }],
});
const d5len = dBriefEnd + 0.5 - dBrief;
seg('d5-brief', DEMO(dBrief, dBriefEnd + 0.5), {
  zoom: [Z(0, 1.0), Z(1.2, 1.18, 990, 560), Z(d5len - 1.3, 1.18, 990, 560), Z(d5len - 0.6, 1.0)],
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: C.d5a, from: 0, to: dDraft - dBrief - 1.4 }, { file: C.d5b, from: dDraft - dBrief - 1.4, to: 99 }],
});
seg('d6-combo', DEMO(dBriefEnd + 0.5, dClear - 0.2), {
  speed: 1.5,
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: TAG.x15, from: 0, to: 99 }, { file: C.d6, from: 0, to: 99 }],
});
seg('d7-zero', DEMO(dClear - 0.2, dClear + 3.8), {
  zoom: [Z(0, 1.0), Z(1.1, 1.6, 1260, 520)],
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: C.d7, from: 0, to: 99 }],
});

// 3. The real Gmail raid from v3, with its own captions; no 137 explainer, no undo detour.
let s = seg('r1-scan', OLD(41.0, 43.7), { overlays: [{ file: TAG.restored, from: 0, to: 99 }, { file: C.r1, from: 0, to: 99 }] });
hitFx(D.fight, 0.05, 1.1, tOut - s + (43.75 - 41.0));
s = seg('r2-buser', OLD(43.7, 47.6), {});
hitFx(dTrash, 0.15, 1.0, tOut - s + (46.25 - 43.7));
s = seg('r3-unsub', OLD(49.3, 52.3), {});
hitFx(dCrit, 1.1, 1.2, tOut - s + (51.0 - 49.3));
seg('r4-draft', OLD(62.3, 64.95), {});
seg('r5-rest', OLD(65.0, 69.1), {});
s = seg('r6-report', OLD(69.1, 72.6), {});
hitFx(dClear, 0.1, 2.2, tOut - s + 0.1);
seg('g1-empty', OLD(72.75, 75.9), {});
seg('g2-drafts', OLD(76.0, 79.6), {});

// 4. Where to play.
seg('e1-end', { image: END }, { dur: 6.0, fadeOutV: 0.8 });

// ---------- picture, then one soundtrack ----------
fs.writeFileSync(path.join(work, 'list.txt'), segs.map((x) => `file '${x.file.replace(/\\/g, '/')}'`).join('\n'));
run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', path.join(work, 'joined.mp4')]);
fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ L: tOut, fx, audio: D.audio }));
fs.writeFileSync(path.join(work, 'segments.json'), JSON.stringify(segs.map(({ name, out, start }) => ({ name, start, out })), null, 1));
mix(tOut, fx, D.audio);

/** The licensed track under the whole video, the game's effects on top. */
function mix(L, fx, audio) {
  // Effects: each clip of the demo take's audio, sped like its picture, delayed to its place.
  const fxIn = fx.flatMap((f) => ['-ss', f.from.toFixed(3), '-t', (f.to - f.from).toFixed(3), '-i', audio]);
  const fxChains = fx.map((f, i) => {
    const len = (f.to - f.from) / (f.tempo || 1);
    const tempo = f.tempo && f.tempo !== 1 ? `atempo=${f.tempo},` : '';
    return `[${i + 2}:a]aresample=48000,${tempo}afade=in:d=0.02,afade=out:st=${Math.max(0, len - 0.08).toFixed(3)}:d=0.08,adelay=${Math.round(f.at * 1000)}:all=1[f${i}]`;
  });
  const filter = [
    `[1:a]aresample=48000,volume=${process.env.MUSIC_GAIN || '0.42'},afade=in:d=0.4,afade=out:st=${(L - 2.2).toFixed(2)}:d=2.2,atrim=0:${L.toFixed(3)}[mus]`,
    ...fxChains,
    `[mus]${fx.map((_, i) => `[f${i}]`).join('')}amix=inputs=${fx.length + 1}:normalize=0:duration=first,highshelf=f=6000:g=-2,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
  ].join(';');
  run(['-i', path.join(work, 'joined.mp4'), '-ss', String(MUSIC_AT), '-t', (L + 0.5).toFixed(3), '-i', MUSIC, ...fxIn,
    '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', L.toFixed(3), path.resolve(OUTF)]);
  console.log('done', OUTF, L.toFixed(2), 's');
}
