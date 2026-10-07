// The demo video, v2: the quick Demo (every mechanic, privacy off) and then a real Gmail
// raid (privacy on). Two raid-bot takes, each with its own audio aligned on its FIGHT!.
//   node tools/video/base.mjs <demo take>; node tools/video/base.mjs <real take>
//   node tools/video/edit2.mjs <demo take> <real take> <out.mp4>
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontUrl = (p) => pathToFileURL(path.join(ROOT, 'node_modules/@fontsource', p)).href;
const [demoDir, realDir, OUTF] = process.argv.slice(2).map((p) => path.resolve(p));
const work = path.join(path.dirname(OUTF), 'edit2');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

function take(dir) {
  const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
  const T0 = frames[0].t;
  const at = (e) => (e.t - T0) / 1000;
  const all = (fn) => events.filter(fn).map(at);
  const one = (fn) => { const v = all(fn)[0]; if (v === undefined) throw new Error(`missing event in ${dir}`); return v; };
  return {
    dir, at, all, one, events,
    base: path.join(dir, 'base.mp4'),
    audio: path.join(dir, 'inbox-raid-audio.webm'),
    fight: one((e) => e.type === 'stamp' && e.text === 'FIGHT!'),
    end: (frames.at(-1).t - T0) / 1000,
    final: events.find((e) => e.type === 'final').text,
  };
}
const D = take(demoDir);
const R = take(realDir);
const stamp = (T, text) => T.all((e) => e.type === 'stamp' && e.text === text);
const key = (T, re) => T.all((e) => e.type === 'key' && re.test(e.what));
const kind = (T, k) => T.all((e) => e.type === k);

// ---------- graphics ----------
const css = `
@font-face{font-family:SG;font-weight:700;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-700-normal.woff2')})}
@font-face{font-family:SG;font-weight:500;src:url(${fontUrl('space-grotesk/files/space-grotesk-latin-500-normal.woff2')})}
@font-face{font-family:DM;font-weight:500;src:url(${fontUrl('dm-mono/files/dm-mono-latin-500-normal.woff2')})}
*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;background:transparent;font-family:SG}`;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
async function png(name, html, transparent = true) {
  const htmlFile = path.join(work, `${name}.html`);
  fs.writeFileSync(htmlFile, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}
const NAVY = '#0d1733', CYAN = '#75dbf3', BLUE = '#4aa3ff', CORAL = '#ff6e67', GOLD = '#ffd35c';
const c = (s, col = CYAN) => `<b style="font-weight:700;color:${col}">${s}</b>`;
// Captions sit on the strip of small buttons, never over the play area or the action buttons.
const cap = (name, text, color = CYAN) => png(name, `
  <div style="position:absolute;left:0;right:0;bottom:0;height:66px;background:${NAVY}f2;border-top:3px solid ${color};display:flex;align-items:center;justify-content:center">
    <p style="color:#f2f7fd;font:500 28px SG">${text}</p></div>`);
const chip = (name, text, color = CYAN) => png(name, `
  <div style="position:absolute;left:50%;top:18px;transform:translateX(-50%);padding:10px 16px;background:${NAVY}f2;border:2px solid ${color};color:${color};font:500 22px DM;letter-spacing:.16em">${text}</div>`);

const realStart = Number(R.final.match(/([\d.,]+)\s*→\s*0/)?.[1].replace(/[.,]/g, '')) || 0;
const realTime = R.final.match(/TIME\n([\d:]+)/)?.[1] || '';
const C = {
  title: await cap('c-title', `${c('INBOX RAID')} turns inbox cleanup into an arcade raid.`),
  demo: await cap('c-demo', `The 20-second demo: no login, a fake inbox, every mechanic.`),
  boss: await cap('c-boss', `Senders who flood you are ${c('BOSSES', CORAL)}. Their HP is how many emails they sent.`, CORAL),
  crit: await cap('c-crit', `${c('U')} sends a one-click unsubscribe: ${c('CRITICAL HIT')} and an arcade medal.`),
  board: await cap('c-board', `Then the ${c('TRIAGE BOARD', BLUE)}: every other email goes to a zone.`, BLUE),
  brief: await cap('c-brief', `${c('ACT')} opens a briefing: the game reads the email and suggests a reply.`),
  draft: await cap('c-draft', `${c('S')} saves it as a Gmail ${c('draft')}. The game never sends anything.`),
  combo: await cap('c-combo', `Fast calls build the combo up to ${c('x8', GOLD)}.`, GOLD),
  zero: await cap('c-zero', `${c('INBOX ZERO')} and three arcade medals.`, GOLD),
  real: await cap('c-real', `Now my ${c('real Gmail')}: ${realStart} emails in the inbox.`),
  privacy: await cap('c-privacy', `Privacy mode is on: every subject and every person is blacked out.`),
  rboss: await cap('c-rboss', `Every hit really archives, trashes or unsubscribes in Gmail.`, CORAL),
  later: await cap('c-later', `${c(`${key(R, /^boss /).filter((x) => x > stamp(R, 'CRITICAL HIT!')[0] + 3.4).length} bosses later`, CORAL)}: the horde, at max combo.`, CORAL),
  oops: await cap('c-oops', `Wrong call? ${c('Z')} undoes it, in Gmail too.`, BLUE),
  rdraft: await cap('c-rdraft', `A real reply draft, written by the game and saved in Gmail.`),
  rlater: await cap('c-rlater', `${c('A minute later', BLUE)}: the last cards.`, BLUE),
  rzero: await cap('c-rzero', `${c('INBOX ZERO')}: ${realStart} real emails in ${realTime}.`, GOLD),
  after: await cap('c-after', `Back in Gmail: the inbox is really empty.`),
  drafts: await cap('c-drafts', `And the reply waits in Drafts, for me to send or not.`),
};
const SPED = await chip('k-sped', 'SPED UP');
const DEMO = await chip('k-demo', 'DEMO · FAKE INBOX', GOLD);
const REAL = await chip('k-real', 'REAL GMAIL', CORAL);

const endCard = await png('end', `
  <div style="width:1920px;height:1080px;background:radial-gradient(circle at 18% 22%,#1f8bff30,transparent 34%),#0a1024;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
    <img src="${pathToFileURL(path.join(realDir, 'inbox-raid.png')).href}" style="width:1040px;box-shadow:0 30px 60px #0008">
    <p style="color:#f2f7fd;font:700 46px SG">Play it: <span style="color:${CYAN}">josemardp.github.io/inbox-raid</span></p>
    <p style="color:#c7d2e6;font:500 22px DM;letter-spacing:.06em;text-align:center;line-height:1.8">No server: your inbox never leaves your browser · English and Portuguese<br>Built solo with Claude Code for Hackyard Yard #4</p>
  </div>`, false);
await browser.close();

// ---------- segments ----------
const ENC = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const run = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const segs = [];
// Every edge gets a tiny audio fade, so cuts never click.
const EDGE = 0.06;
// The real boss fight has a long stretch of steady music: every bed comes from there.
let bed = 0;
const BED0 = 18;
const bedInput = (dur) => { const a = ['-ss', (BED0 + bed).toFixed(3), '-t', dur.toFixed(3), '-i', R.audio]; bed += dur; return a; };

function clip(name, T, from, to, { speed = 1, overlays = [], fadeIn = 0, fadeOut = 0 } = {}) {
  const dur = to - from;
  const out = dur / speed;
  const inputs = ['-ss', from.toFixed(3), '-t', dur.toFixed(3), '-i', T.base];
  const aFrom = from - T.fight;
  const pre = to <= T.fight;
  // Before FIGHT! a take has no game audio: a quiet bed from the demo music runs instead.
  if (pre) inputs.push(...bedInput(out));
  else if (aFrom >= 0) inputs.push('-ss', aFrom.toFixed(3), '-t', dur.toFixed(3), '-i', T.audio);
  else inputs.push('-t', (dur + aFrom).toFixed(3), '-i', T.audio);
  // Part of the clip before FIGHT!: the bed plays, then the game audio takes over.
  const lead = !pre && aFrom < 0 ? -aFrom / speed : 0;
  overlays.forEach((o) => inputs.push('-i', o.file));
  if (lead) inputs.push(...bedInput(lead));
  let v = `[0:v]setpts=(PTS-STARTPTS)/${speed}[v0]`;
  overlays.forEach((o, i) => { v += `;[v${i}][${i + 2}:v]overlay=0:0:enable='between(t,${Math.max(0, o.from).toFixed(2)},${o.to.toFixed(2)})'[v${i + 1}]`; });
  let vl = `v${overlays.length}`;
  if (fadeIn || fadeOut) { v += `;[${vl}]${[fadeIn && `fade=in:d=${fadeIn}`, fadeOut && `fade=out:st=${(out - fadeOut).toFixed(2)}:d=${fadeOut}`].filter(Boolean).join(',')}[vf]`; vl = 'vf'; }
  const delay = aFrom < 0 && !pre ? `adelay=${Math.round(-aFrom * 1000)}:all=1,` : '';
  const tempo = pre || speed === 1 ? '' : speed <= 2 ? `atempo=${speed},` : `atempo=2,atempo=${Math.min(2, speed / 2).toFixed(4)},`;
  const vol = pre ? 'volume=0.6,' : speed > 2 ? 'volume=0.5,' : '';
  const fades = `afade=in:d=${Math.max(EDGE, fadeIn)},afade=out:st=${(out - Math.max(EDGE, fadeOut)).toFixed(3)}:d=${Math.max(EDGE, fadeOut)}`;
  const a = lead
    ? `[${overlays.length + 2}:a]volume=0.6,apad,atrim=0:${lead.toFixed(3)},afade=out:st=${Math.max(0, lead - 0.15).toFixed(3)}:d=0.15[bd];[1:a]${tempo}afade=in:d=0.05[ga];[bd][ga]concat=n=2:v=0:a=1,apad,atrim=0:${out.toFixed(3)},${fades}[a]`
    : `[1:a]${delay}${tempo}${vol}apad,atrim=0:${out.toFixed(3)},${fades}[a]`;
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-filter_complex', `${v};${a}`, '-map', `[${vl}]`, '-map', '[a]', '-t', out.toFixed(3), ...ENC, file]);
  segs.push(file);
  console.log(name, out.toFixed(2), 's');
}

function still(name, image, dur, { blur = [], overlays = [], fadeIn = 0.35, fadeOut = 0.35, vol = 0.6 } = {}) {
  const inputs = ['-loop', '1', '-t', String(dur), '-i', image, ...bedInput(dur)];
  overlays.forEach((o) => inputs.push('-i', o.file));
  let v = '[0:v]scale=1920:1080,setsar=1,format=yuv420p[s0]';
  let last = 's0';
  blur.forEach(([x, y, w, h], i) => {
    v += `;[${last}]split[m${i}][c${i}];[c${i}]crop=${w}:${h}:${x}:${y},gblur=sigma=18:steps=3[b${i}];[m${i}][b${i}]overlay=${x}:${y}[s${i + 1}]`;
    last = `s${i + 1}`;
  });
  overlays.forEach((o, i) => { v += `;[${last}][${i + 2}:v]overlay=0:0:enable='between(t,${o.from},${o.to})'[o${i}]`; last = `o${i}`; });
  v += `;[${last}]fade=in:d=${fadeIn},fade=out:st=${(dur - fadeOut).toFixed(2)}:d=${fadeOut}[vf]`;
  const a = `[1:a]volume=${vol},apad,atrim=0:${dur},afade=in:d=0.4,afade=out:st=${(dur - 0.5).toFixed(2)}:d=0.5[a]`;
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-filter_complex', `${v};${a}`, '-map', '[vf]', '-map', '[a]', '-t', String(dur), ...ENC, file]);
  segs.push(file);
  console.log(name, dur, 's');
}

// ===== Part A: the quick demo =====
const dDemoKey = key(D, /^demo$/)[0];
const dCrit = stamp(D, 'CRITICAL HIT!')[0];
const dHorde = stamp(D, 'HORDE INCOMING!')[0];
const dBrief = kind(D, 'brief-open')[0];
const dDraft = kind(D, 'draft-saved')[0];
const dBriefEnd = kind(D, 'brief-closed')[0];
const dMax = stamp(D, 'MAX COMBO!')[0] ?? stamp(D, 'COMBO x5!')[0];
const dClear = kind(D, 'clear')[0];
const a1 = Math.max(0, dDemoKey - 2.6);
clip('a1-title', D, a1, dDemoKey + 0.3, { fadeIn: 0.4, overlays: [{ file: C.title, from: 0.2, to: 99 }] });
const a2 = dDemoKey + 0.3;
const rel2 = (t) => t - a2;
clip('a2-bosses', D, a2, dHorde + 0.3, {
  overlays: [
    { file: DEMO, from: 0, to: 99 },
    { file: C.demo, from: 0, to: rel2(D.fight) + 0.8 },
    { file: C.boss, from: rel2(D.fight) + 0.8, to: rel2(dCrit) - 0.6 },
    { file: C.crit, from: rel2(dCrit) - 0.6, to: 99 },
  ],
});
const a3 = dHorde + 0.3;
const rel3 = (t) => t - a3;
clip('a3-board', D, a3, dBriefEnd + 0.9, {
  overlays: [
    { file: DEMO, from: 0, to: 99 },
    { file: C.board, from: 0, to: rel3(dBrief) },
    { file: C.brief, from: rel3(dBrief), to: rel3(dDraft) - 1.6 },
    { file: C.draft, from: rel3(dDraft) - 1.6, to: 99 },
  ],
});
const a4 = dBriefEnd + 0.9;
const a4end = Math.min(D.end, dClear + 3.9);
clip('a4-zero', D, a4, a4end, {
  fadeOut: 0.4,
  overlays: [
    { file: DEMO, from: 0, to: 99 },
    { file: C.combo, from: 0, to: dClear - a4 },
    { file: C.zero, from: dClear - a4, to: 99 },
  ],
});

// ===== Part B: the real Gmail =====
const rG = key(R, /^gmail$/)[0];
const rCrits = stamp(R, 'CRITICAL HIT!');
const rHorde = stamp(R, 'HORDE INCOMING!')[0];
const rOops = kind(R, 'oops-start')[0];
const rOopsEnd = kind(R, 'oops-end')[0];
const rDraft = kind(R, 'draft-saved')[0];
const rBriefs = kind(R, 'brief-open');
const rBriefCloses = kind(R, 'brief-closed');
const rClear = kind(R, 'clear')[0];
// Blur every sender and subject (some are people), the account corner, and keep the count.
still('b1-before', path.join(realDir, 'gmail-before-inbox.png'), 3.6, {
  blur: [[400, 170, 1260, 885], [1830, 20, 80, 60]],
  overlays: [{ file: C.real, from: 0.2, to: 3.6 }],
});
clip('b2-signin', R, rG - 1.2, rG + 0.6, { overlays: [{ file: REAL, from: 0, to: 99 }, { file: C.privacy, from: 0, to: 99 }] });
const b3a = rG + 0.6, b3b = R.fight - 0.7;
clip('b3-scan', R, b3a, b3b, { speed: (b3b - b3a) / 3, overlays: [{ file: REAL, from: 0, to: 99 }, { file: SPED, from: 0, to: 99 }, { file: C.privacy, from: 0, to: 99 }] });
const b4b = rCrits[0] + 3.4;
clip('b4-bosses', R, b3b, b4b, { fadeOut: 0.25, overlays: [{ file: REAL, from: 0, to: 99 }, { file: C.rboss, from: 1.2, to: 99 }] });
const b5a = rOops - 4.5;
const draftClose = rBriefCloses.find((x) => x > rDraft) ?? rDraft + 1;
const b5b = draftClose + 1.2;
clip('b5-horde', R, b5a, b5b, {
  fadeIn: 0.25,
  fadeOut: 0.25,
  overlays: [
    { file: REAL, from: 0, to: 99 },
    { file: C.later, from: 0, to: 3.6 },
    { file: C.oops, from: rOops - b5a - 0.2, to: rOopsEnd - b5a + 1.4 },
    { file: C.rdraft, from: rBriefs.find((x) => x > rOopsEnd + 2) - b5a, to: 99 },
  ],
});
const b6a = rClear - 6;
clip('b6-zero', R, b6a, Math.min(R.end, rClear + 3.9), {
  fadeIn: 0.25,
  fadeOut: 0.4,
  overlays: [{ file: REAL, from: 0, to: 6 }, { file: C.rlater, from: 0, to: 3 }, { file: C.rzero, from: 6.2, to: 99 }],
});
still('b7-after', path.join(realDir, 'gmail-after-inbox.png'), 3.2, {
  blur: [[1830, 20, 80, 60], [1650, 360, 260, 70]],
  overlays: [{ file: C.after, from: 0.2, to: 3.2 }],
});
// The drafts page: only the game's draft row stays readable (sender column), the rest is blurred.
still('b8-drafts', path.join(realDir, 'gmail-after-drafts.png'), 3.2, {
  blur: [[840, 255, 1000, 60], [560, 320, 1300, 220], [1830, 20, 80, 60]],
  overlays: [{ file: C.drafts, from: 0.2, to: 3.2 }],
});
still('b9-end', endCard, 5.5, { fadeIn: 0.6, fadeOut: 0.8, vol: 0.3 });

fs.writeFileSync(path.join(work, 'list.txt'), segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
const joined = path.join(work, 'joined.mp4');
run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined]);
// A little air off the top and loudness at YouTube's level.
run(['-i', joined, '-c:v', 'copy', '-af', 'highshelf=f=6000:g=-3,loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', OUTF]);
console.log('done', OUTF);
