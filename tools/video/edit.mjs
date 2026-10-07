// Edits a raid-bot Gmail take into the demo video.
//   node tools/video/base.mjs <take>   (first)
//   node tools/video/edit.mjs <take>   ->  <take>/inbox-raid-demo.mp4
// Captions, keycaps and the end card are drawn in the game font with Playwright.
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONT = path.join(ROOT, 'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2');

const dir = path.resolve(process.argv[2]);
const work = path.join(dir, 'edit');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
const T0 = frames[0].t;
const at = (e) => (e.t - T0) / 1000;
const find = (fn) => { const e = events.find(fn); if (!e) throw new Error('missing event ' + fn); return at(e); };
const tG = find((e) => e.type === 'key' && e.what === 'gmail');
const tFight = find((e) => e.type === 'stamp' && e.text === 'FIGHT!');
const tHorde = find((e) => e.type === 'stamp' && e.text === 'HORDE INCOMING!');
const tClear = find((e) => e.type === 'clear');
const tEnd = (frames.at(-1).t - T0) / 1000;
const crits = events.filter((e) => e.type === 'stamp' && e.text === 'CRITICAL HIT!').map(at);
const bossKeys = events.filter((e) => e.type === 'key' && /^boss /.test(e.what)).map((e) => ({ t: at(e), key: e.key, what: e.what }));
const final = events.find((e) => e.type === 'final').text;
const start = Number(final.match(/([\d,]+) → 0/)?.[1].replace(/,/g, '')) || 0;
const time = final.match(/TIME\n([\d:]+)/)?.[1] || '';
const unsubs = final.match(/UNSUBS SENT\n(\d+)/)?.[1] || '0';
console.log({ tG, tFight, tHorde, tClear, tEnd, crits, start, time, unsubs });

// ---------- graphics ----------
const css = `@font-face{font-family:px;src:url(file:///${FONT.replace(/\\/g, '/')})}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent;font-family:px;-webkit-font-smoothing:none}`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
async function png(name, html, transparent = true) {
  // A file page, so the local font and images load (about:blank cannot read file://).
  const htmlFile = path.join(work, `${name}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}
const caption = (name, text, color = '#ffd23f') => png(name, `
  <div style="position:absolute;left:0;right:0;bottom:0;height:104px;background:#07071acc;border-top:4px solid ${color};display:flex;align-items:center;justify-content:center">
    <p style="color:#fff;font-size:27px;line-height:1.5;text-align:center;text-shadow:3px 3px 0 #000;max-width:1800px">${text}</p></div>`);
const badge = (name, text) => png(name, `
  <div style="position:absolute;right:40px;top:170px;padding:14px 18px;background:#07071acc;border:4px solid #29e7ff;color:#29e7ff;font-size:26px;text-shadow:3px 3px 0 #000">${text}</div>`);
const keycap = (name, label) => png(name, `
  <div style="position:absolute;right:48px;bottom:150px;width:120px;height:120px;background:#0b0b1e;border:6px solid #ffd23f;box-shadow:8px 8px 0 #000;display:flex;align-items:center;justify-content:center;color:#ffd23f;font-size:${label.length > 1 ? 34 : 54}px">${label}</div>`);

const Y = '<b style="font-weight:normal;color:#ffd23f">';
const P = '<b style="font-weight:normal;color:#ff2e88">';
const C = '<b style="font-weight:normal;color:#29e7ff">';
const caps = {
  before: await caption('c-before', `This is my real Gmail: ${Y}${start} emails</b> in the inbox (Gmail counts threads).`),
  title: await caption('c-title', `${C}INBOX RAID</b>. Privacy mode is ${Y}ON</b> for this video.`, '#29e7ff'),
  scan: await caption('c-scan', `G: sign in with Google, the game reads the inbox.`, '#29e7ff'),
  boss: await caption('c-boss', `A sender who floods you is a ${P}BOSS</b>. HP = how many emails.`, '#ff2e88'),
  crit: await caption('c-crit', `${Y}U</b> sends a real one-click unsubscribe: ${Y}CRITICAL HIT</b>`),
  hits: await caption('c-hits', `${C}A</b> archives, ${P}D</b> trashes. Every hit really changes Gmail.`, '#29e7ff'),
  privacy: await caption('c-privacy', `Private senders and every subject stay blacked out.`, '#9aa0c8'),
  horde: await caption('c-horde', `Then the ${P}HORDE</b>: one email per card. Fast decisions build combos.`, '#ff2e88'),
  clear: await caption('c-clear', `${Y}INBOX ZERO</b>. ${start} real emails in ${time}, ${unsubs} unsubscribes sent.`),
  after: await caption('c-after', `Back in Gmail: the inbox is really empty.`, '#3cff7a'),
};
const badges = { scan: await badge('b-scan', 'SPED UP'), horde: await badge('b-horde', '2x SPEED') };
const KEYLABEL = { a: 'A', d: 'D', u: 'U', s: 'S', p: 'P', g: 'G', c: 'C', ArrowLeft: '←', ArrowDown: '↓', ArrowRight: '→' };
const keycaps = {};
for (const [k, l] of Object.entries(KEYLABEL)) keycaps[k] = await keycap(`k-${k}`, l);

// Blur the subjects (and anything personal) on the Gmail stills; senders are brands.
const endCard = await png('end', `
  <div style="width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 120%,#2a1450 0%,transparent 60%),#0b0b1e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px">
    <img src="file:///${path.join(dir, 'inbox-raid.png').replace(/\\/g, '/')}" style="width:1000px;image-rendering:pixelated;box-shadow:12px 12px 0 #000;border:4px solid #29e7ff">
    <p style="color:#ffd23f;font-size:40px;text-shadow:4px 4px 0 #000">PLAY: josemardp.github.io/inbox-raid</p>
    <p style="color:#9aa0c8;font-size:22px;line-height:1.8;text-align:center">No server: your inbox never leaves your browser.<br>Built solo with Claude Code for Hackyard Yard #4.</p>
  </div>`, false);
await browser.close();

// ---------- segments ----------
const AUDIO = path.join(dir, 'inbox-raid-audio.webm');
const BASE = path.join(dir, 'base.mp4');
const ENC = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const segs = [];
const bedStart = 4; // a calm stretch of the boss music for the stills
let bedCursor = bedStart;

function run(args) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' }); }

/** A slice of the take, `speed` times faster, with the game audio aligned on FIGHT!. */
function clip(name, from, to, { speed = 1, overlays = [], fadeIn = 0, fadeOut = 0 } = {}) {
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
  const delay = aFrom < 0 ? `adelay=${Math.round(-aFrom * 1000)}:all=1,` : '';
  const tempo = speed === 1 ? '' : speed <= 2 ? `atempo=${speed},` : `atempo=2,atempo=${speed / 2},`;
  const a = preFight
    ? `[1:a]volume=0.35,apad,atrim=0:${out.toFixed(3)}[a]`
    : `[1:a]${delay}${tempo}apad,atrim=0:${out.toFixed(3)}[a]`;
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

const keyOverlays = (from, to, speed = 1) => events
  .filter((e) => e.type === 'key' && at(e) >= from && at(e) < to && keycaps[e.key])
  .map((e) => ({ file: keycaps[e.key], from: (at(e) - from) / speed, to: (at(e) - from) / speed + Math.max(0.35, 0.7 / speed) }));

// 1. Gmail before.
still('s1-before', path.join(dir, 'gmail-before-inbox.png'), 4.2, {
  blur: [[830, 170, 830, 885], [1640, 80, 180, 40]],
  overlays: [{ file: caps.before, from: 0.3, to: 4.2 }],
  aFadeOut: 0,
});
// 2. Title, privacy on, G.
const s2a = Math.max(0, tG - 3.6);
clip('s2-title', s2a, tG + 0.6, {
  fadeIn: 0.3,
  overlays: [{ file: caps.title, from: 0, to: tG - s2a - 1.2 }, { file: caps.scan, from: tG - s2a - 1.2, to: 99 }, ...keyOverlays(s2a, tG + 0.6)],
});
// 3. Sign-in and scan, sped up to about 4 s.
const s3a = tG + 0.6, s3b = tFight - 1.6;
const s3speed = Math.max(1, (s3b - s3a) / 4);
clip('s3-scan', s3a, s3b, { speed: s3speed, overlays: [{ file: caps.scan, from: 0, to: 99 }, { file: badges.scan, from: 0, to: 99 }] });
// 4. READY, FIGHT! and every boss, real time.
const s4a = tFight - 1.6, s4b = tHorde + 0.9;
const rel = (t) => t - s4a;
const crit = crits[0] ?? tFight + 6;
const lastBoss = bossKeys.at(-1)?.t ?? tHorde;
const archive = bossKeys.find((b) => b.t > crit + 4 && b.key === 'a')?.t ?? crit + 8;
clip('s4-bosses', s4a, s4b, {
  overlays: [
    { file: caps.boss, from: rel(tFight) + 0.4, to: rel(crit) - 1.6 },
    { file: caps.crit, from: rel(crit) - 1.6, to: rel(crit) + 2.6 },
    { file: caps.hits, from: rel(archive) - 1.5, to: rel(archive) + 3 },
    { file: caps.privacy, from: rel(archive) + 6, to: Math.min(rel(archive) + 11, rel(lastBoss) - 1) },
    ...keyOverlays(s4a, s4b),
  ],
});
// 5. The horde at 2x.
const s5a = tHorde + 0.9, s5b = tClear - 0.4;
clip('s5-horde', s5a, s5b, {
  speed: 2,
  overlays: [{ file: caps.horde, from: 0, to: 5 }, { file: badges.horde, from: 0, to: 99 }, ...keyOverlays(s5a, s5b, 2)],
});
// 6. INBOX ZERO and the share card.
const s6b = Math.min(tEnd, tClear + 7.5);
clip('s6-clear', s5b, s6b, { fadeOut: 0.4, overlays: [{ file: caps.clear, from: 1.2, to: 99 }, ...keyOverlays(s5b, s6b)] });
// 7. Gmail after.
still('s7-after', path.join(dir, 'gmail-after-inbox.png'), 3.8, { blur: [[1450, 730, 360, 70]], overlays: [{ file: caps.after, from: 0.3, to: 3.8 }], bed: tClear - tFight + 0.2, bedVol: 0.5 });
// 8. End card.
still('s8-end', endCard, 5, { fadeIn: 0.6, fadeOut: 0.8, bed: bedStart + 20, bedVol: 0.3 });

fs.writeFileSync(path.join(work, 'list.txt'), segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
const OUTF = path.join(dir, 'inbox-raid-demo.mp4');
run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', OUTF]);
console.log('done', OUTF);
