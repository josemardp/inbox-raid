// Plays INBOX RAID like a person and records the page for the demo video.
// Not part of the site. Needs Playwright (global install) and Chrome.
//
//   node tools/video/raid-bot.mjs --mode demo  --out <dir>
//   node tools/video/raid-bot.mjs --mode gmail --out <dir> --plan plan.json --profile <chrome profile>
//
// Output in <dir>: frames/*.jpg (CDP screencast, 1920x1080), frames.json (timestamps),
// events.json (stamps, keys, screens), inbox-raid-audio.webm (?rec), inbox-raid.png (card).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const MODE = arg('mode', 'demo');
const OUT = path.resolve(arg('out', `video-${MODE}`));
const URL_ = arg('url', 'https://josemardp.github.io/inbox-raid/?rec');
const PLAN = arg('plan') ? JSON.parse(fs.readFileSync(arg('plan'), 'utf8')) : { boss: {}, horde: {} };
const PROFILE = arg('profile') || fs.mkdtempSync(path.join(os.tmpdir(), 'raid-bot-'));
const PRIVACY = MODE === 'gmail' || flag('privacy');
const ACCOUNT = arg('account', 'josemardp@gmail.com');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

const events = [];
const ev = (type, data = {}) => { const e = { t: Date.now(), type, ...data }; events.push(e); console.log(new Date(e.t).toISOString().slice(11, 23), type, JSON.stringify(data)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// A profile closed by force opens with a "restore pages" bar that shrinks the captured
// page: mark it as closed normally first.
for (const prefs of [path.join(PROFILE, 'Default', 'Preferences')]) {
  try {
    const p = JSON.parse(fs.readFileSync(prefs, 'utf8'));
    p.profile = { ...(p.profile || {}), exit_type: 'Normal', exited_cleanly: true };
    fs.writeFileSync(prefs, JSON.stringify(p));
  } catch { /* fresh profile */ }
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  // Headless: no window, so no browser bar (translate, debugging, restore) can shrink the
  // captured page. The scale flag makes the screencast 1920x1080.
  headless: true,
  viewport: { width: 1280, height: 720 },
  acceptDownloads: true,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--force-device-scale-factor=1.5', '--hide-crash-restore-bubble', '--disable-session-crashed-bubble', '--no-default-browser-check', '--disable-features=Translate,TranslateUI', '--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.addInitScript(() => {
  // Any moment the page grows past the window (a scrollbar would flash) is logged.
  window.__over = 0;
  const watch = () => { const o = document.documentElement.scrollHeight - innerHeight; if (o > window.__over) window.__over = o; requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  window.__stamps = [];
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList.contains('stamp')) window.__stamps.push({ t: Date.now(), text: n.textContent });
    }
  }).observe(document, { childList: true, subtree: true });
});
page.on('console', (m) => { if (m.type() === 'error') ev('console-error', { text: m.text().slice(0, 200) }); });
page.on('download', async (d) => { const f = path.join(OUT, d.suggestedFilename()); await d.saveAs(f); ev('download', { file: d.suggestedFilename() }); });
// "OPENS THEIR PAGE" unsubscribes open a tab: close it, the video never shows it.
page.on('popup', async (p) => { await p.waitForLoadState('domcontentloaded').catch(() => {}); if (events.some((e) => e.type === 'fight-screen') && !p.url().includes('accounts.google.com')) { ev('closed-tab', { url: p.url().slice(0, 60) }); p.close().catch(() => {}); } });

// ---------- screencast ----------
const frames = [];
const cdp = await ctx.newCDPSession(page);
let frameN = 0;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const n = ++frameN;
  const file = `${String(n).padStart(6, '0')}.jpg`;
  frames.push({ file, t: metadata.timestamp * 1000, h: metadata.deviceHeight });
  if (frames.length > 1 && Math.abs(metadata.deviceHeight - frames[0].h) > 1 && !frames.sizeWarned) { frames.sizeWarned = true; ev('frame-size-changed', { from: frames[0].h, to: metadata.deviceHeight }); }
  fs.writeFile(path.join(OUT, 'frames', file), Buffer.from(data, 'base64'), () => {});
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });

// ---------- game state ----------
const state = () => page.evaluate(() => {
  const view = document.querySelector('.overlay .mission') ? 'brief' : document.querySelector('.brief.boss') ? 'boss' : (document.querySelector('.card.live') || document.querySelector('.zones')) ? 'horde' : document.querySelector('.report') ? 'clear' : document.querySelector('.brief.scan') ? 'scan' : document.querySelector('.brief.title') ? 'title' : 'none';
  const label = document.querySelector('.orbit-tag')?.textContent || '';
  const sprite = document.querySelector('.boss-sprite canvas.monster, .card-sprite canvas.monster, .mini-card.sel canvas.monster');
  const briefReady = !!document.querySelector('.overlay .mission') && !document.querySelector('.overlay .fulltext.loading') && !!document.querySelector('.overlay [data-brief]');
  const canDraft = !!document.querySelector('.overlay [data-brief="draft"]:not(:disabled)');
  const briefKey = document.querySelector('.overlay .mission .email')?.textContent || '';
  const tag = document.querySelector('.brief.boss .critical')?.textContent || '';
  const unsubOk = !document.querySelector('button[data-action="unsubscribe"]')?.disabled;
  const privacyOn = /PRIVACY ON/.test(document.querySelector('#controls')?.textContent || '');
  return { view, label, key: sprite?.dataset.key || '', tag, unsubOk, privacyOn, briefReady, canDraft, briefKey, stamps: window.__stamps.splice(0) };
});

const KEY = { archive: 'a', trash: 'd', unsubscribe: 'u', spare: 's' };
const HKEY = { archive: 'ArrowLeft', trash: 'ArrowDown', star: 'ArrowRight' };

let demoUnsubs = 0;
function bossMove(s, idx) {
  const planned = PLAN.boss[s.key];
  if (planned) return planned === 'unsubscribe' && !s.unsubOk ? 'archive' : planned;
  if (MODE === 'gmail' || PLAN.defaultBoss) return PLAN.defaultBoss || 'archive';
  if (/critical/i.test(s.tag) && s.unsubOk && demoUnsubs < 3) { demoUnsubs++; return 'unsubscribe'; }
  return idx % 3 === 1 ? 'trash' : 'archive';
}
const hordeSeen = {};
function hordeMove(s) {
  const n = hordeSeen[s.key] = (hordeSeen[s.key] || 0) + 1;
  const planned = PLAN.horde[`${s.key}#${n}`] || PLAN.horde[s.key];
  if (planned) return planned;
  if (MODE === 'gmail' || PLAN.defaultHorde) return PLAN.defaultHorde || 'star';
  const r = Math.random();
  return r < 0.6 ? 'archive' : r < 0.85 ? 'trash' : 'star';
}

async function press(key, what) {
  ev('key', { key, what });
  await page.keyboard.press(key);
}

// ---------- a human pace ----------
// A person reads a boss before hitting it, slows down on some cards, speeds up on a run of
// obvious ones, and once in a while hits the wrong key and undoes it.
let streak = 0;
let hordeN = 0;
let mistakeDone = !flag('oops') && MODE !== 'gmail';
let draftsDone = 0;
const MAX_DRAFTS = Number(arg('drafts', '1'));

/** The briefing: read the email, try the reply tones, save one draft (or just star it). */
async function handleBrief() {
  for (let i = 0; i < 200 && !(await state()).briefReady; i++) await sleep(50);
  const b = await state();
  ev('brief-open', { canDraft: b.canDraft });
  await sleep(rand(2400, 3300));
  if (b.canDraft && draftsDone < MAX_DRAFTS) {
    await press('2', 'tone later'); await sleep(rand(900, 1200));
    await press('1', 'tone yes'); await sleep(rand(1300, 1700));
    draftsDone++;
    await press('s', 'save draft');
    ev('draft-saved');
  } else {
    await press(HKEY.star, 'brief star');
  }
  for (let i = 0; i < 200 && (await state()).view === 'brief'; i++) await sleep(50);
  ev('brief-closed');
}
function think(s) {
  if (s.view === 'boss') {
    const r = Math.random();
    return r < 0.2 ? rand(1500, 2200) : r < 0.85 ? rand(2300, 3900) : rand(4100, 5200);
  }
  // The short demo keeps its combo alive from the last boss to the last card.
  if (MODE === 'demo') return rand(800, 1600);
  if (streak > 0) { streak--; return rand(650, 1000); }
  const r = Math.random();
  if (r < 0.15) { streak = 2 + Math.floor(rand(0, 3)); return rand(800, 1100); }
  return r < 0.75 ? rand(1000, 1900) : rand(1900, 2800);
}
/** Archives an email that deserved a star, notices, presses Z and stars it. */
async function oops(cur, right) {
  mistakeDone = true;
  ev('oops-start', { label: cur.label });
  await press(HKEY.archive, 'horde archive (oops)');
  const label = cur.label;
  for (let i = 0; i < 100 && (await state()).label === label; i++) await sleep(40);
  await sleep(rand(900, 1300));
  await press('z', 'undo');
  for (let i = 0; i < 150 && (await state()).label !== label; i++) await sleep(40);
  await sleep(rand(900, 1300));
  hordeN++;
  await press(HKEY[right], `horde ${right} (after undo)`);
  ev('oops-end');
}

// ---------- Google sign-in popup ----------
async function handleSignIn(popup) {
  ev('signin-popup', { url: popup.url().slice(0, 60) });
  for (let i = 0; i < 40 && !popup.isClosed(); i++) {
    await sleep(1000);
    if (popup.isClosed()) break;
    try {
      const acct = popup.getByText(ACCOUNT, { exact: true });
      if (await acct.count()) { await acct.first().click(); ev('signin-account'); continue; }
      for (const c of await popup.getByRole('checkbox').all()) if (!(await c.isChecked())) await c.check();
      const btn = popup.getByRole('button', { name: /^(Continuar|Continue|Permitir|Allow)$/ });
      if (await btn.count()) { await btn.last().click(); ev('signin-continue'); }
    } catch (e) { if (!popup.isClosed()) ev('signin-retry', { err: e.message.slice(0, 80) }); }
  }
  ev('signin-done', { closed: popup.isClosed() });
}

// ---------- Gmail stills (before and after) ----------
async function gmailShots(tag) {
  if (MODE !== 'gmail') return;
  const g = await ctx.newPage();
  const shots = [['search', 'https://mail.google.com/mail/u/0/#search/in%3Ainbox'], ['inbox', 'https://mail.google.com/mail/u/0/#inbox']];
  if (tag === 'after') shots.push(['drafts', 'https://mail.google.com/mail/u/0/#drafts']);
  for (const [name, url] of shots) {
    await g.goto(url);
    await g.mouse.move(1000, 700);
    await sleep(7000);
    await g.screenshot({ path: path.join(OUT, `gmail-${tag}-${name}.png`) });
  }
  await g.close();
  await page.bringToFront();
  ev('gmail-shots', { tag });
}

// ---------- run ----------
await gmailShots('before');
// Start with privacy off, so the video shows P turning it on.
await page.addInitScript(() => {
  if (!sessionStorage.getItem('bot-init')) { sessionStorage.setItem('bot-init', '1'); localStorage.setItem('inbox-raid-privacy', '0'); }
  localStorage.setItem('inbox-raid-lang', 'en');
  // The triage board, without the first-run coach notes.
  localStorage.setItem('inbox-raid-style', 'board');
  localStorage.setItem('inbox-raid-tutorial-v1', '1');
});
await page.goto(URL_);
await page.waitForSelector('.brief.title');
await page.evaluate(() => document.fonts.ready);
await startCast();
ev('cast-start');
await sleep(2600);

let s = await state();
if (PRIVACY !== s.privacyOn) { await press('p', 'privacy'); await sleep(2200); }
await sleep(900);

// Never touch the inbox if the capture is already broken.
if (frames.sizeWarned) { ev('abort', { why: 'frame size changed before the raid' }); await ctx.close(); process.exit(2); }

if (MODE === 'gmail') {
  const popupP = ctx.waitForEvent('page', { timeout: 20000 });
  await press('g', 'gmail');
  handleSignIn(await popupP).catch((e) => ev('signin-error', { err: e.message }));
} else {
  await press('Enter', 'demo');
}

// Scan, then the raid.
ev('scan-start');
let lastLabel = '';
let bossIdx = 0;
let pressedAt = 0;
let clearAt = 0;
const t0 = Date.now();
while (Date.now() - t0 < 15 * 60_000) {
  s = await state();
  for (const st of s.stamps) events.push({ t: st.t, type: 'stamp', text: st.text });
  if (s.view === 'clear') { clearAt = Date.now(); ev('clear'); break; }
  if (s.view === 'title' && events.some((e) => e.type === 'fight-screen')) { ev('back-to-title'); break; }
  if (s.view === 'brief') { await handleBrief(); pressedAt = Date.now(); await sleep(40); continue; }
  if (s.view === 'boss' || s.view === 'horde') {
    if (s.label !== lastLabel) {
      if (!lastLabel) ev('fight-screen');
      lastLabel = s.label;
      ev('screen', { label: s.label, key: s.key, tag: s.tag });
      await sleep(think(s));
      const cur = await state();
      if (cur.label !== s.label) continue;
      if (s.view === 'boss') { const mv = bossMove(cur, bossIdx++); await press(KEY[mv], `boss ${mv} ${cur.key}`); }
      else {
        const mv = hordeMove(cur);
        if (mv === 'star' && !mistakeDone && hordeN >= 4) { await oops(cur, mv); continue; }
        hordeN++;
        await press(HKEY[mv], `horde ${mv}`);
      }
      pressedAt = Date.now();
    } else if (pressedAt && Date.now() - pressedAt > 6000) {
      // The key was dropped (Gmail slow or an animation): let the screen be pressed again.
      ev('retry-screen', { label: s.label });
      lastLabel = '';
      pressedAt = 0;
    }
  }
  await sleep(40);
}

if (clearAt) {
  await sleep(3200);
  await press('c', 'card');
  await sleep(4500);
}
await gmailShots('after');
const final = await page.evaluate(() => document.querySelector('#screen')?.innerText || '');
ev('final', { text: final.slice(0, 400), maxOverflow: await page.evaluate(() => window.__over) });
await cdp.send('Page.stopScreencast');
await sleep(800);
fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames));
fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(events, null, 1));
await page.screenshot({ path: path.join(OUT, 'final.png') });
await ctx.close();
console.log(`frames ${frames.length}, out ${OUT}`);
