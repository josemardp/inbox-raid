// The demo video, v3: hook with the real 202 -> 0, then the no-login demo, then the real
// Gmail raid, then the proof (empty inbox, draft in Drafts), then the demo URL.
// Large captions for phones, gentle zooms on what must be read. Nothing is uploaded.
//   node tools/video/edit3.mjs <demo take> <real take> <music bed.wav> <out.mp4>
// Takes are raid-bot outputs with base.mp4 (tools/video/base.mjs); the bed comes from music-bed.mjs.
import { createRequire } from 'node:module';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontUrl = (p) => pathToFileURL(path.join(ROOT, 'node_modules/@fontsource', p)).href;
const [demoDir, realDir, BED, OUTF] = process.argv.slice(2).map((p) => path.resolve(p));
const work = path.join(path.dirname(OUTF), 'edit3');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

function take(dir) {
  const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  const events = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
  const T0 = frames[0].t;
  const at = (e) => (e.t - T0) / 1000;
  const all = (fn) => events.filter(fn).map(at);
  return {
    dir, all,
    base: path.join(dir, 'base.mp4'),
    audio: path.join(dir, 'inbox-raid-audio.webm'),
    fight: all((e) => e.type === 'stamp' && e.text === 'FIGHT!')[0],
    // MediaRecorder webm files carry no duration header: decode once to measure it.
    audioDur: (() => {
      const r = spawnSync('ffmpeg', ['-v', 'info', '-i', path.join(dir, 'inbox-raid-audio.webm'), '-f', 'null', '-'], { encoding: 'utf8' });
      const m = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Infinity;
    })(),
    end: (frames.at(-1).t - T0) / 1000,
  };
}
const D = take(demoDir);
const R = take(realDir);
const stamp = (T, text) => T.all((e) => e.type === 'stamp' && e.text === text);
const key = (T, re) => T.all((e) => e.type === 'key' && re.test(e.what));
const kind = (T, k) => T.all((e) => e.type === k);
const must = (v, what) => { if (v === undefined || Number.isNaN(v)) throw new Error(`missing ${what}`); return v; };

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
// Big captions: 56px bold on a solid bar, readable at 360p (about 19 px tall there).
const cap = (text, color = CYAN) => png(`
  <div style="position:absolute;left:0;right:0;bottom:0;padding:26px 60px 30px;background:${NAVY}f5;border-top:6px solid ${color};display:flex;justify-content:center">
    <p style="max-width:1760px;color:${WHITE};font:700 56px/1.18 SG;text-align:center;text-wrap:balance">${text}</p></div>`);
// Section label, top centre, over the game's empty top bar.
const chip = (text, color) => png(`
  <div style="position:absolute;left:50%;top:22px;transform:translateX(-50%);padding:12px 22px;background:${NAVY}f5;border:4px solid ${color};color:${color};font:700 36px DM;letter-spacing:.08em;white-space:nowrap">${text}</div>`);
const tag = (text, color = GOLD) => png(`
  <div style="position:absolute;right:30px;top:120px;padding:10px 18px;background:${NAVY}f5;border:3px solid ${color};color:${color};font:700 30px DM;letter-spacing:.08em">${text}</div>`);
// A box around a spot on a still, with a label next to it.
const callout = (boxes) => png(boxes.map(([x, y, w, h, label, lx, ly, color = GOLD]) => `
  <div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:6px solid ${color};border-radius:10px;box-shadow:0 0 0 4px ${NAVY}"></div>
  <div style="position:absolute;left:${lx}px;top:${ly}px;padding:10px 18px;background:${NAVY};border:4px solid ${color};color:${WHITE};font:700 40px SG;white-space:nowrap">${label}</div>`).join(''));

const CH = {
  demo: await chip('DEMO · FAKE INBOX · NO LOGIN', GOLD),
  real: await chip('REAL GMAIL · PRIVACY ON', CORAL),
  gmail: await chip('REAL GMAIL', CORAL),
};
const TAG = { sped: await tag('SPED UP'), x15: await tag('1.5× SPEED'), x14: await tag('SPED UP 14×') };
const C = {
  hook: await cap(`I turned inbox cleanup into an ${hi('arcade raid')}.`),
  hook2: await cap(`${hi('202', CORAL)} real Gmail emails → ${hi('0')}.`),
  d1: await cap(`Try the demo first: ${hi('no login')}, fake emails.`, GOLD),
  d2: await cap(`Senders who flood you become ${hi('bosses', CORAL)}.<br>HP = how many emails they sent.`, CORAL),
  d3: await cap(`${hi('U')} sends an unsubscribe request: ${hi('critical hit', GOLD)}.`, GOLD),
  d4: await cap(`Every other email lands on the ${hi('triage board')}.`),
  d5a: await cap(`${hi('ACT')} reads the email and suggests a reply.`),
  d5b: await cap(`In the demo, the draft is only a ${hi('pretend preview', GOLD)}.`, GOLD),
  d6: await cap(`Fast calls build the combo up to ${hi('×8', GOLD)}.`, GOLD),
  d7: await cap(`Inbox zero, plus ${hi('arcade medals', GOLD)}.`, GOLD),
  r1a: await cap(`Now my ${hi('real Gmail', CORAL)}: 202 emails in the inbox.`, CORAL),
  r1b: await cap(`For this take, 194 of them were restored from Trash.<br>Real emails, real Gmail actions.`, CORAL),
  r2: await cap(`Privacy mode blacks out every subject and sender.`, CORAL),
  r3a: await cap(`${hi('Archive')} and ${hi('trash', CORAL)} change Gmail right away.`, CORAL),
  r3b: await cap(`${hi('U')} sends a real unsubscribe request.`, CORAL),
  r4a: await cap(`Wrong call? ${hi('Z')} undoes the last hit.`),
  r4b: await cap(`${hi('ACT')} opens the briefing for this email.`),
  r4c: await cap(`${hi('S')} saves the reply as a Gmail ${hi('draft')}. Never sent.`),
  r5: await cap(`The rest of the raid.`, CORAL),
  r6: await cap(`Report: 202 cleared, ${hi('1 reply draft', GOLD)} waiting in Gmail.`, GOLD),
  g1: await cap(`Gmail confirms it: the inbox is ${hi('empty')}.`),
  g2: await cap(`The reply waits in ${hi('Drafts')}, unsent.`),
};
// Gmail stills are 1280x720 shots scaled to 1920x1080: coordinates below are in that space.
const GB_CALL = await callout([[70, 220, 320, 56, '137 = unread, not the total', 420, 214]]);
const GA_CALL = await callout([[985, 168, 250, 60, '“Nenhum e-mail novo” = no new email', 600, 262, CYAN]]);
const GD_CALL = await callout([[610, 256, 145, 54, '“Rascunho” = Draft', 560, 330, CYAN]]);
const END = await png(`
  <div style="width:1920px;height:1080px;background:radial-gradient(circle at 18% 22%,#1f8bff38,transparent 36%),#0a1024;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;text-align:center">
    <p style="color:${GOLD};font:700 64px SG;letter-spacing:.02em">PLAY THE DEMO · NO LOGIN</p>
    <p style="color:${WHITE};font:700 92px SG;letter-spacing:-.01em">josemardp.github.io/<span style="color:${CYAN}">inbox-raid</span></p>
    <p style="color:#c7d2e6;font:500 34px SG;line-height:1.5;max-width:1500px">Real Gmail mode is open only to invited test accounts<br>while Google reviews the app. No server: it runs in your browser.</p>
    <p style="color:#8fa0c2;font:500 28px DM;letter-spacing:.06em">Built solo with Claude Code · Hackyard Yard #4</p>
  </div>`, false);
await browser.close();

// ---------- segment builder ----------
const ENC = ['-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const run = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const segs = [];
let bedAt = 0;
const bedIn = (dur) => { const a = ['-ss', bedAt.toFixed(3), '-t', dur.toFixed(3), '-i', BED]; bedAt += dur; return a; };
const EDGE = 0.05;

/** Piecewise smoothstep through keyframes [{t, v}], t in input seconds (frame index / 30). */
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
/** Zoom keyframes [{t, z, x, y}] (x, y = the point to keep centred, 1920x1080 space). */
function zoomFilter(keys) {
  if (!keys) return '';
  const z = curve(keys.map((k) => ({ t: k.t, v: k.z })));
  const cx = curve(keys.map((k) => ({ t: k.t, v: k.x })));
  const cy = curve(keys.map((k) => ({ t: k.t, v: k.y })));
  return `,zoompan=z='${z}':x='clip((${cx})-iw/zoom/2,0,iw-iw/zoom)':y='clip((${cy})-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1920x1080:fps=30`;
}

/**
 * One segment. src: {take, from, to} or {image}. audio: 'game' (the take's own, aligned on
 * FIGHT!, bed before it) or 'bed'. Overlays: [{file, from, to}] in output seconds.
 */
function seg(name, src, { dur, speed = 1, zoom, blur = [], pre = [], overlays = [], audio = 'game', gain = 1, fadeOutV = 0, bedAfter }) {
  const inputs = [];
  let out;
  let vin;
  if (src.image) {
    out = dur;
    inputs.push('-loop', '1', '-framerate', '30', '-t', out.toFixed(3), '-i', src.image);
    vin = '[0:v]scale=1920:1080,setsar=1,format=yuv420p';
  } else {
    const len = src.to - src.from;
    out = len / speed;
    inputs.push('-ss', src.from.toFixed(3), '-t', len.toFixed(3), '-i', src.take.base);
    vin = '[0:v]setsar=1';
  }
  // Audio input #1.
  let a;
  const T = src.take;
  const preFight = !src.image && src.to <= T.fight;
  if (src.image || audio === 'bed' || preFight) {
    inputs.push(...bedIn(out));
    a = `[1:a]volume=${(src.image ? 0.9 : 1.0) * gain},apad,atrim=0:${out.toFixed(3)}`;
  } else {
    const aFrom = src.from - T.fight;
    const tempo = speed === 1 ? '' : `atempo=${speed},`;
    // The game stops recording sound a few seconds after its final screen: from there on,
    // the music bed takes over instead of silence.
    // bedAfter: where the game itself falls silent (after the fanfare), in output seconds.
    const audioEnds = bedAfter ?? (T.fight + T.audioDur - src.from) / speed;
    if (aFrom >= 0 && audioEnds < out - 0.1) {
      inputs.push('-ss', aFrom.toFixed(3), '-t', (src.to - src.from).toFixed(3), '-i', T.audio);
      const tail = out - audioEnds;
      inputs.push(...bedIn(tail + 0.2));
      a = `[1:a]${tempo}volume=${gain},atrim=0:${audioEnds.toFixed(3)},afade=out:st=${Math.max(0, audioEnds - 0.25).toFixed(3)}:d=0.25[ga];[2:a]volume=0.9,atrim=0:${(tail + 0.2).toFixed(3)},afade=in:d=0.25[bd];[ga][bd]concat=n=2:v=0:a=1,apad,atrim=0:${out.toFixed(3)}`;
    } else if (aFrom >= 0) {
      inputs.push('-ss', aFrom.toFixed(3), '-t', (src.to - src.from).toFixed(3), '-i', T.audio);
      a = `[1:a]${tempo}volume=${gain},apad,atrim=0:${out.toFixed(3)}`;
    } else {
      // Starts before FIGHT!: bed first, then the game audio.
      const lead = -aFrom / speed;
      inputs.push('-t', (src.to - T.fight).toFixed(3), '-i', T.audio);
      inputs.push(...bedIn(lead));
      a = `[2:a]volume=1.0,apad,atrim=0:${lead.toFixed(3)},afade=out:st=${Math.max(0, lead - 0.12).toFixed(3)}:d=0.12[bd];[1:a]${tempo}volume=${gain},afade=in:d=0.04[ga];[bd][ga]concat=n=2:v=0:a=1,apad,atrim=0:${out.toFixed(3)}`;
    }
  }
  const firstPre = inputs.filter((x) => x === '-i').length;
  pre.forEach((o) => inputs.push('-i', o.file));
  const firstOverlay = firstPre + pre.length;
  overlays.forEach((o) => inputs.push('-i', o.file));
  // Blur (stills) happens before the zoom, so a zoomed frame never shows unblurred pixels.
  let v = `${vin}[b0]`;
  let last = 'b0';
  blur.forEach(([x, y, w, h], i) => {
    v += `;[${last}]split[m${i}][c${i}];[c${i}]crop=${w}:${h}:${x}:${y},gblur=sigma=22:steps=3[q${i}];[m${i}][q${i}]overlay=${x}:${y}[b${i + 1}]`;
    last = `b${i + 1}`;
  });
  // Callouts on a still sit in the still's own coordinates: drawn before the zoom.
  pre.forEach((o, i) => { v += `;[${last}][${firstPre + i}:v]overlay=0:0[p${i}]`; last = `p${i}`; });
  v += `;[${last}]null${zoomFilter(zoom)},setpts=(PTS-STARTPTS)/${speed}[z0]`;
  last = 'z0';
  overlays.forEach((o, i) => {
    v += `;[${last}][${firstOverlay + i}:v]overlay=0:0:enable='between(t,${Math.max(0, o.from).toFixed(2)},${Math.min(out, o.to).toFixed(2)})'[o${i}]`;
    last = `o${i}`;
  });
  if (fadeOutV) { v += `;[${last}]fade=out:st=${(out - fadeOutV).toFixed(2)}:d=${fadeOutV}[vf]`; last = 'vf'; }
  a += `,afade=in:d=${EDGE},afade=out:st=${(out - Math.max(EDGE, fadeOutV)).toFixed(3)}:d=${Math.max(EDGE, fadeOutV)}[a]`;
  const file = path.join(work, `${name}.mp4`);
  run([...inputs, '-filter_complex', `${v};${a}`, '-map', `[${last}]`, '-map', '[a]', '-t', out.toFixed(3), ...ENC, file]);
  segs.push({ name, file, out });
  console.log(name.padEnd(12), out.toFixed(2), 's');
  return out;
}
const Z = (t, z, x = 960, y = 540) => ({ t, z, x, y });

// ---------- story ----------
const dKey = must(key(D, /^demo$/)[0], 'demo key');
const dCrit = must(stamp(D, 'CRITICAL HIT!')[0], 'demo crit');
const dHorde = must(stamp(D, 'HORDE INCOMING!')[0], 'demo horde');
const dBrief = must(kind(D, 'brief-open')[0], 'demo brief');
const dDraft = must(kind(D, 'draft-saved')[0], 'demo draft');
const dBriefEnd = must(kind(D, 'brief-closed')[0], 'demo brief end');
const dClear = must(kind(D, 'clear')[0], 'demo clear');
const rG = must(key(R, /^gmail$/)[0], 'gmail key');
const rCrit = must(stamp(R, 'CRITICAL HIT!')[0], 'real crit');
const rOops = must(kind(R, 'oops-start')[0], 'oops');
const rOopsEnd = must(kind(R, 'oops-end')[0], 'oops end');
const rDraft = must(kind(R, 'draft-saved')[0], 'real draft');
const rBriefDraft = must(kind(R, 'brief-open').filter((x) => x < rDraft).at(-1), 'real brief');
const rBriefDraftEnd = must(kind(R, 'brief-closed').find((x) => x > rDraft), 'real brief end');
const rClear = must(kind(R, 'clear')[0], 'real clear');

// 1. Hook: the real scan (202 emails) and the real result (202 -> 0).
seg('h1-ready', { take: R, from: R.fight - 3.0, to: R.fight - 0.4 }, {
  zoom: [Z(0, 1.45, 1220, 560)],
  overlays: [{ file: CH.gmail, from: 0, to: 9 }, { file: C.hook, from: 0, to: 9 }],
});
seg('h2-result', { take: R, from: rClear + 0.9, to: rClear + 3.9 }, {
  zoom: [Z(0, 1.0, 960, 540), Z(0.9, 1.75, 470, 470)],
  overlays: [{ file: CH.gmail, from: 0, to: 9 }, { file: C.hook2, from: 0, to: 9 }],
});

// 2. The no-login demo.
seg('d1-title', { take: D, from: dKey - 2.2, to: dKey + 0.2 }, {
    overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d1, from: 0, to: 9 }],
});
seg('d2-boss', { take: D, from: D.fight - 0.3, to: dCrit - 0.75 }, {
  zoom: [Z(0, 1.0), Z(0.8, 1.25, 1120, 480)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d2, from: 0, to: 9 }],
});
seg('d3-crit', { take: D, from: dCrit - 0.75, to: dHorde - 0.9 }, {
  zoom: [Z(0, 1.25, 1120, 480), Z(0.6, 1.0)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d3, from: 0, to: 9 }],
});
seg('d4-board', { take: D, from: dHorde - 0.9, to: dBrief }, {
  zoom: [Z(0, 1.0), Z(1.6, 1.2, 1000, 600)],
  overlays: [{ file: CH.demo, from: 0, to: 9 }, { file: C.d4, from: 0, to: 9 }],
});
const d5len = dBriefEnd + 0.5 - dBrief;
seg('d5-brief', { take: D, from: dBrief, to: dBriefEnd + 0.5 }, {
  zoom: [Z(0, 1.0), Z(1.2, 1.18, 990, 560), Z(d5len - 1.3, 1.18, 990, 560), Z(d5len - 0.6, 1.0)],
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: C.d5a, from: 0, to: dDraft - dBrief - 1.4 }, { file: C.d5b, from: dDraft - dBrief - 1.4, to: 99 }],
});
seg('d6-combo', { take: D, from: dBriefEnd + 0.5, to: dClear - 0.2 }, {
  speed: 1.5,
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: TAG.x15, from: 0, to: 99 }, { file: C.d6, from: 0, to: 99 }],
});
seg('d7-zero', { take: D, from: dClear - 0.2, to: dClear + 3.0 }, {
  bedAfter: 1.15,
  zoom: [Z(0, 1.0), Z(1.1, 1.45, 1300, 300)],
  overlays: [{ file: CH.demo, from: 0, to: 99 }, { file: C.d7, from: 0, to: 99 }],
});

// 3. The real Gmail. Every sender and subject blurred, account corner too; 137 explained.
seg('r1-gmail', { image: path.join(realDir, 'gmail-before-inbox.png') }, {
  dur: 6.2,
  blur: [[520, 170, 1360, 910], [1840, 10, 80, 80]],
  zoom: [Z(0, 1.4, 640, 380)],
  pre: [{ file: GB_CALL }],
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: C.r1a, from: 0, to: 3.0 }, { file: C.r1b, from: 3.0, to: 99 }],
});
seg('r2-scan', { take: R, from: rG + 0.6, to: R.fight - 2.0 }, {
  speed: (R.fight - 2.0 - rG - 0.6) / 2.6, audio: 'bed',
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: TAG.sped, from: 0, to: 99 }, { file: C.r2, from: 0, to: 99 }],
});
const r3a = R.fight - 0.4, r3b = rCrit + 2.4;
seg('r3-bosses', { take: R, from: r3a, to: r3b }, {
  zoom: [Z(0, 1.0), Z(1.2, 1.3, 1150, 520)],
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: C.r3a, from: 0, to: rCrit - r3a - 1.6 }, { file: C.r3b, from: rCrit - r3a - 1.6, to: 99 }],
});
seg('r4-undo', { take: R, from: rOops - 1.2, to: rOopsEnd + 0.3 }, {
  zoom: [Z(0, 1.15, 760, 560)],
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: C.r4a, from: 0, to: 99 }],
});
const r5len = rBriefDraftEnd + 0.6 - (rBriefDraft - 0.6);
seg('r5-draft', { take: R, from: rBriefDraft - 0.6, to: rBriefDraftEnd + 0.6 }, {
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: C.r4b, from: 0, to: rDraft - rBriefDraft - 0.8 }, { file: C.r4c, from: rDraft - rBriefDraft - 0.8, to: r5len }],
});
seg('r6-rest', { take: R, from: rBriefDraftEnd + 0.6, to: rClear - 0.3 }, {
  speed: 14, audio: 'bed',
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: TAG.x14, from: 0, to: 99 }, { file: C.r5, from: 0, to: 99 }],
});
seg('r7-report', { take: R, from: rClear - 0.3, to: rClear + 3.4 }, {
  zoom: [Z(0, 1.0), Z(1.2, 1.4, 1300, 330)],
  overlays: [{ file: CH.real, from: 0, to: 99 }, { file: C.r6, from: 0, to: 99 }],
});

// 4. Proof in Gmail itself.
seg('g1-empty', { image: path.join(realDir, 'gmail-after-inbox.png') }, {
  dur: 3.4,
  blur: [[1840, 10, 80, 80]],
  zoom: [Z(0, 1.38, 700, 330)],
  pre: [{ file: GA_CALL }],
  overlays: [{ file: CH.gmail, from: 0, to: 99 }, { file: C.g1, from: 0, to: 99 }],
});
seg('g2-drafts', { image: path.join(realDir, 'gmail-after-drafts.png') }, {
  dur: 3.6,
  // Only the game's draft row stays readable; its subject (a third party's name) and the
  // owner's own drafts are blurred, as is the account corner.
  blur: [[830, 255, 1010, 60], [380, 320, 1460, 190], [1830, 10, 90, 80]],
  zoom: [Z(0, 1.38, 760, 330)],
  pre: [{ file: GD_CALL }],
  overlays: [{ file: CH.gmail, from: 0, to: 99 }, { file: C.g2, from: 0, to: 99 }],
});

// 5. Where to play.
seg('e1-end', { image: END }, { dur: 5.5, gain: 0.85, fadeOutV: 0.8 });

fs.writeFileSync(path.join(work, 'list.txt'), segs.map((s) => `file '${s.file.replace(/\\/g, '/')}'`).join('\n'));
fs.writeFileSync(path.join(work, 'segments.json'), JSON.stringify(segs.map(({ name, out }) => ({ name, out })), null, 1));
const joined = path.join(work, 'joined.mp4');
run(['-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined]);
run(['-i', joined, '-c:v', 'copy', '-af', 'highshelf=f=6000:g=-3,loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', OUTF]);
console.log('done', OUTF, segs.reduce((s, x) => s + x.out, 0).toFixed(2), 's');
