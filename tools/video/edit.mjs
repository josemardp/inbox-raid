// Edits a raid-bot Gmail take into the demo video.
//   node tools/video/base.mjs <take>   (first)
//   node tools/video/edit.mjs <take>   ->  <take>/inbox-raid-demo.mp4
// Captions and the end card are drawn with Playwright in the game's own fonts and colours.
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontUrl = (p) => pathToFileURL(path.join(ROOT, 'node_modules/@fontsource', p)).href;

const dir = path.resolve(process.argv[2]);
const work = path.join(dir, 'edit');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
const T0 = frames[0].t;
const at = (e) => (e.t - T0) / 1000;
const find = (fn, fallback) => { const e = events.find(fn); if (!e && fallback === undefined) throw new Error('missing event ' + fn); return e ? at(e) : fallback; };
const tP = find((e) => e.type === 'key' && e.what === 'privacy', 0);
const tG = find((e) => e.type === 'key' && e.what === 'gmail');
const tFight = find((e) => e.type === 'stamp' && e.text === 'FIGHT!');
const tHorde = find((e) => e.type === 'stamp' && e.text === 'HORDE INCOMING!');
const tClear = find((e) => e.type === 'clear');
const tOops = find((e) => e.type === 'oops-start', -1);
const tOopsEnd = find((e) => e.type === 'oops-end', -1);
const tEnd = (frames.at(-1).t - T0) / 1000;
const crits = events.filter((e) => e.type === 'stamp' && e.text === 'CRITICAL HIT!').map(at);
const bossKeys = events.filter((e) => e.type === 'key' && /^boss /.test(e.what)).map((e) => ({ t: at(e), key: e.key }));
const hordeKeys = events.filter((e) => e.type === 'key' && /^horde /.test(e.what)).map(at);
const final = events.find((e) => e.type === 'final').text;
const start = Number(final.match(/([\d.,]+)\s*→\s*0/)?.[1].replace(/[.,]/g, '')) || 0;
const time = final.match(/TIME\n([\d:]+)/)?.[1] || '';
const unsubs = final.match(/UNSUBS SENT\n(\d+)/)?.[1] || '0';
console.log({ tP, tG, tFight, tHorde, tOops, tClear, tEnd, crits, start, time, unsubs });

// ---------- graphics ----------
const css = `
@font-face{font-family:SG;font-weight:700;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-700-normal.woff2')})}
@font-face{font-family:SG;font-weight:500;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-500-normal.woff2')})}
@font-face{font-family:DM;font-weight:500;src:url(${fontUrl('dm-mono/files/dm-mono-latin-500-normal.woff2')})}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent;font-family:SG}`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
async function png(name, html, transparent = true) {
  // A file page, so the local fonts and images load (about:blank cannot read file://).
  const htmlFile = path.join(work, `${name}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}
const NAVY = '#0d1733', CYAN = '#75dbf3', BLUE = '#4aa3ff', CORAL = '#ff6e67';
// A caption bar over the bottom strip of small buttons, never over the action buttons.
const caption = (name, text, color = CYAN) => png(name, `
  <div style="position:absolute;left:0;right:0;bottom:0;height:66px;background:${NAVY}f2;border-top:3px solid ${color};display:flex;align-items:center;justify-content:center">
    <p style="color:#f2f7fd;font:500 28px SG;letter-spacing:.005em">${text}</p></div>`);
const badge = (name, text) => png(name, `
  <div style="position:absolute;right:36px;top:150px;padding:10px 16px;background:${NAVY}f2;border:2px solid ${CYAN};color:${CYAN};font:500 22px DM;letter-spacing:.16em">${text}</div>`);

const c = (s, col = CYAN) => `<b style="font-weight:700;color:${col}">${s}</b>`;
const caps = {
  before: await caption('c-before', `This is my real Gmail inbox: ${c(`${start} emails`)} waiting.`),
  title: await caption('c-title', `${c('INBOX RAID')} turns cleaning your inbox into an arcade raid.`),
  privacy: await caption('c-privacy', `${c('P')} privacy mode: subjects and people get blacked out for this video.`),
  scan: await caption('c-scan', `Sign in with Google. The game reads the inbox right in the browser.`),
  boss: await caption('c-boss', `Senders who flood you become ${c('BOSSES', CORAL)}. HP = how many emails they sent.`, CORAL),
  crit: await caption('c-crit', `${c('U')} sends a real one-click unsubscribe: ${c('CRITICAL HIT')}`),
  hits: await caption('c-hits', `${c('A')} archives, ${c('D', CORAL)} trashes. Every hit really changes Gmail.`),
  dials: await caption('c-dials', `The dials: your inbox draining, and your stress. Hesitate and the needle climbs.`, BLUE),
  horde: await caption('c-horde', `Then the ${c('HORDE', CORAL)}: one email per card. Quick decisions build combos.`, CORAL),
  oops: await caption('c-oops', `Wrong call? ${c('Z')} undoes it, in Gmail too.`, BLUE),
  clear: await caption('c-clear', `${c('INBOX ZERO')}: ${start} real emails in ${time}, ${unsubs} unsubscribes sent.`),
  after: await caption('c-after', `Back in Gmail: the inbox is really empty.`),
};
const sped = await badge('b-sped', 'SPED UP');

const endCard = await png('end', `
  <div style="width:1920px;height:1080px;background:radial-gradient(circle at 18% 22%,#1f8bff30,transparent 34%),#0a1024;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
    <img src="${pathToFileURL(path.join(dir, 'inbox-raid.png')).href}" style="width:1040px;box-shadow:0 30px 60px #0008">
    <p style="color:#f2f7fd;font:700 46px SG">Play it: <span style="color:${CYAN}">josemardp.github.io/inbox-raid</span></p>
    <p style="color:#c7d2e6;font:500 22px DM;letter-spacing:.06em;text-align:center;line-height:1.8">No server: your inbox never leaves your browser · English and Portuguese<br>Built solo with Claude Code for Hackyard Yard #4</p>
  </div>`, false);
await browser.close();

/** A caption made after the main batch (its text depends on the cut). */
async function captionFile(name, text, color) {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const htmlFile = path.join(work, `${name}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset=utf-8><style>${css}</style>
    <div style="position:absolute;left:0;right:0;bottom:0;height:66px;background:${NAVY}f2;border-top:3px solid ${color};display:flex;align-items:center;justify-content:center">
    <p style="color:#f2f7fd;font:500 28px SG">${text}</p></div>`);
  await p.goto(pathToFileURL(htmlFile).href);
  await p.evaluate(() => document.fonts.ready);
  const file = path.join(work, `${name}.png`);
  await p.screenshot({ path: file, omitBackground: true });
  await b.close();
  return file;
}

// ---------- segments ----------
const AUDIO = path.join(dir, 'inbox-raid-audio.webm');
const BASE = path.join(dir, 'base.mp4');
const ENC = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const segs = [];
const bedStart = 4; // a calm stretch of the boss music for the stills
let bedCursor = bedStart;

function run(args) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' }); }

/** A slice of the take, `speed` times faster, with the game audio aligned on FIGHT!. */
function clip(name, from, to, { speed = 1, overlays = [], fadeIn = 0, fadeOut = 0, mute = false } = {}) {
  const dur = to - from;
  const out = dur / speed;
  const inputs = ['-ss', from.toFixed(3), '-t', dur.toFixed(3), '-i', BASE];
  const aFrom = from - tFight;
  const preFight = to <= tFight;
  // Before FIGHT! the game recorded no audio: the music bed from the stills keeps going.
  if (preFight) { inputs.push('-ss', bedCursor.toFixed(3), '-t', out.toFixed(3), '-i', AUDIO); bedCursor += out; }
  else if (aFrom >= 0) inputs.push('-ss', aFrom.toFixed(3), '-t', dur.toFixed(3), '-i', AUDIO);
  else inputs.push('-t', (dur + aFrom).toFixed(3), '-i', AUDIO);
  overlays.forEach((o) => inputs.push('-i', o.file));
  let v = `[0:v]setpts=(PTS-STARTPTS)/${speed}[v0]`;
  overlays.forEach((o, i) => {
    v += `;[v${i}][${i + 2}:v]overlay=0:0:enable='between(t,${o.from.toFixed(2)},${o.to.toFixed(2)})'[v${i + 1}]`;
  });
  let vl = `v${overlays.length}`;
  if (fadeIn || fadeOut) { v += `;[${vl}]${[fadeIn && `fade=in:d=${fadeIn}`, fadeOut && `fade=out:st=${(out - fadeOut).toFixed(2)}:d=${fadeOut}`].filter(Boolean).join(',')}[vf]`; vl = 'vf'; }
  const delay = aFrom < 0 && !preFight ? `adelay=${Math.round(-aFrom * 1000)}:all=1,` : '';
  const tempo = speed === 1 ? '' : speed <= 2 ? `atempo=${speed},` : `atempo=2,atempo=${(speed / 2).toFixed(4)},`;
  const afade = [fadeIn && `afade=in:d=${fadeIn}`, fadeOut && `afade=out:st=${(out - fadeOut).toFixed(2)}:d=${fadeOut}`].filter(Boolean).map((s) => s + ',').join('');
  const a = preFight
    ? `[1:a]volume=0.35,apad,atrim=0:${out.toFixed(3)}[a]`
    : `[1:a]${delay}${tempo}volume=${mute ? 0 : 1},apad,atrim=0:${out.toFixed(3)},${afade}anull[a]`;
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-filter_complex', `${v};${a}`, '-map', `[${vl}]`, '-map', '[a]', '-t', out.toFixed(3), ...ENC, file]);
  segs.push(file);
  console.log(name, out.toFixed(2), 's');
}

/** A still image with a music bed from the game audio. */
function still(name, image, dur, { blur = [], overlays = [], fadeIn = 0.4, fadeOut = 0.4, bed, bedVol = 0.35, aFadeOut = 0.8 } = {}) {
  if (bed === undefined) { bed = bedCursor; bedCursor += dur; }
  const inputs = ['-loop', '1', '-t', String(dur), '-i', image, '-ss', String(bed), '-t', String(dur), '-i', AUDIO];
  overlays.forEach((o) => inputs.push('-i', o.file));
  let v = '[0:v]scale=1920:1080,setsar=1,format=yuv420p[s0]';
  let last = 's0';
  blur.forEach(([x, y, w, h], i) => {
    v += `;[${last}]split[m${i}][c${i}];[c${i}]crop=${w}:${h}:${x}:${y},gblur=sigma=16:steps=3[b${i}];[m${i}][b${i}]overlay=${x}:${y}[s${i + 1}]`;
    last = `s${i + 1}`;
  });
  overlays.forEach((o, i) => {
    v += `;[${last}][${i + 2}:v]overlay=0:0:enable='between(t,${o.from},${o.to})'[o${i}]`;
    last = `o${i}`;
  });
  v += `;[${last}]fade=in:d=${fadeIn},fade=out:st=${(dur - fadeOut).toFixed(2)}:d=${fadeOut}[vf]`;
  const a = `[1:a]volume=${bedVol},afade=in:d=0.5${aFadeOut ? `,afade=out:st=${(dur - aFadeOut).toFixed(2)}:d=${aFadeOut}` : ''},apad,atrim=0:${dur}[a]`;
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-filter_complex', `${v};${a}`, '-map', '[vf]', '-map', '[a]', '-t', String(dur), ...ENC, file]);
  segs.push(file);
  console.log(name, dur, 's');
}

// 1. Gmail before: subjects blurred (sender names are brands), plus the account corner.
still('s1-before', path.join(dir, 'gmail-before-inbox.png'), 4.4, {
  blur: [[830, 170, 830, 885], [1640, 80, 180, 40], [1830, 20, 80, 60]],
  overlays: [{ file: caps.before, from: 0.3, to: 4.4 }],
  aFadeOut: 0,
});
// 2. Title, privacy switched on, G.
const s2a = Math.max(0, Math.min(tP, tG) - 1.6), s2b = tG + 0.6;
clip('s2-title', s2a, s2b, {
  fadeIn: 0.3,
  overlays: [
    { file: caps.title, from: 0, to: Math.max(1.4, tP - s2a + 0.2) },
    { file: caps.privacy, from: Math.max(1.4, tP - s2a + 0.2), to: tG - s2a },
    { file: caps.scan, from: tG - s2a, to: 99 },
  ],
});
// 3. Sign-in and scan, sped up to about 4 s.
const s3a = s2b, s3b = tFight - 0.7;
clip('s3-scan', s3a, s3b, { speed: Math.max(1, (s3b - s3a) / 4), overlays: [{ file: caps.scan, from: 0, to: 99 }, { file: sped, from: 0, to: 99 }] });
// 4. READY, FIGHT! and every boss, in real time.
const s4a = s3b, s4b = tHorde + 0.9;
const rel = (t) => t - s4a;
const crit = crits[0] ?? tFight + 6;
const archive = bossKeys.find((b) => b.t > crit + 3 && b.key === 'a')?.t ?? crit + 8;
const lastBoss = bossKeys.at(-1)?.t ?? tHorde;
const bossCaps = [
  { file: caps.boss, from: rel(tFight) + 0.4, to: rel(crit) - 1.8 },
  { file: caps.crit, from: rel(crit) - 1.8, to: rel(crit) + 2.4 },
  { file: caps.hits, from: rel(archive) - 1.6, to: rel(archive) + 3.2 },
  { file: caps.dials, from: rel(archive) + 7, to: Math.min(rel(archive) + 13, rel(lastBoss) - 1) },
];
// A long boss fight keeps its first nine bosses (both early criticals) and its last two.
const nB = bossKeys.length;
const bCutA = nB > 11 ? bossKeys[8].t + 2.6 : 0;
const bCutB = nB > 11 ? bossKeys[nB - 2].t - 2.2 : 0;
if (nB > 11 && bCutB - bCutA > 8) {
  const skipped = nB - 2 - 9;
  const laterBoss = await captionFile('c-later-boss', `${c(`${skipped} bosses later`, CORAL)}: two to go.`, CORAL);
  clip('s4a-bosses', s4a, bCutA, { overlays: bossCaps, fadeOut: 0.25 });
  clip('s4b-bosses', bCutB, s4b, { overlays: [{ file: laterBoss, from: 0, to: 3.2 }], fadeIn: 0.25 });
} else {
  clip('s4-bosses', s4a, s4b, { overlays: bossCaps });
}
// 5. The horde in real time. A long horde keeps its start (with the undo) and its end.
const s5a = s4b, s5b = tClear - 0.4;
const keepA = Math.max(16, tOopsEnd > 0 ? tOopsEnd - s5a + 3 : 0);
if (s5b - s5a > keepA + 14) {
  const cutA = s5a + keepA, cutB = s5b - 9;
  const skipped = hordeKeys.filter((x) => x > cutA && x < cutB).length;
  const later = await captionFile('c-later', `${c(`${skipped} cards later`, BLUE)}: the inbox keeps draining.`, BLUE);
  const ov = [{ file: caps.horde, from: 0, to: 5 }];
  if (tOops > 0) ov.push({ file: caps.oops, from: tOops - s5a + 0.3, to: tOopsEnd - s5a + 1.8 });
  clip('s5a-horde', s5a, cutA, { overlays: ov, fadeOut: 0.25 });
  clip('s5b-horde', cutB, s5b, { overlays: [{ file: later, from: 0, to: 3.5 }], fadeIn: 0.25 });
} else {
  const ov = [{ file: caps.horde, from: 0, to: 5 }];
  if (tOops > 0) ov.push({ file: caps.oops, from: tOops - s5a + 0.3, to: tOopsEnd - s5a + 1.8 });
  clip('s5-horde', s5a, s5b, { overlays: ov });
}
// 6. INBOX ZERO and the share card.
// The game audio stops 4 s after the final screen: cut there.
const s6b = Math.min(tEnd, tClear + 4.5);
clip('s6-clear', s5b, s6b, { fadeOut: 0.4, overlays: [{ file: caps.clear, from: 1.2, to: 99 }] });
// 7. Gmail after.
still('s7-after', path.join(dir, 'gmail-after-inbox.png'), 3.8, { blur: [[1450, 730, 360, 70], [1830, 20, 80, 60]], overlays: [{ file: caps.after, from: 0.3, to: 3.8 }] });
// 8. End card.
still('s8-end', endCard, 5.5, { fadeIn: 0.6, fadeOut: 0.8, bed: bedStart + 20, bedVol: 0.3 });

fs.writeFileSync(path.join(work, 'list.txt'), segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
const OUTF = path.join(dir, 'inbox-raid-demo.mp4');
run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', OUTF]);
console.log('done', OUTF);
