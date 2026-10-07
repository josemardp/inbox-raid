// Font bundled with the site (OFL), so no visitor's IP goes to a font CDN.
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import './style.css';
import { comboSfx, drainSfx, fanfare, isMuted, music, sfx, toggleMute, unlockAudio } from './audio';
import { DemoSource } from './demoSource';
import { GmailSource, preloadGoogle, signIn } from './gmailSource';
import { burst, centreOf, flash, floatText, initFx, shake, stamp } from './fx';
import { Raid, splitInbox, type BossMove, type Hit, type HordeMove } from './raid';
import { recKeepGoing, recStart, recStopSoon } from './recorder';
import { renderShareCard, shareCard } from './shareCard';
import { colorFor, drawMonster, PALETTE } from './sprites';
import { AuthExpiredError, mailtoAddress, unsubPlan, type InboxSource, type Mail, type UnsubPlan } from './types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const screen = $('#screen');
const controls = $('#controls');
const hud = $('#hud');
initFx($<HTMLCanvasElement>('#fx'), $('#stage'));

let source: InboxSource = new DemoSource();
/** The inbox being scanned, so Esc can stop it. */
let scanning: InboxSource | null = null;
let raid: Raid | null = null;
/** Bumped by every new raid or return to title; late async results from an old run are dropped. */
let runId = 0;
let busy = false;
/** Input for a new boss or card is ignored until the player has had time to see it. */
let armedAt = 0;
let signingIn = false;
let needsAuth = false;
let view: 'title' | 'scan' | 'boss' | 'horde' | 'clear' = 'title';
let monsterTimer = 0;

const ARM_BOSS_MS = 350;
const ARM_CARD_MS = 120;

// ---------- helpers ----------

/** Mail data can come from a real inbox: always escape before innerHTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Privacy mode, made for recording: every subject, preview and horde sender is blacked
// out. A boss keeps its name only when it looks like a bulk sender (brands make the video);
// a boss that looks like a person is blacked out too.
let privacy = false;
try { privacy = localStorage.getItem('inbox-raid-privacy') === '1'; } catch { /* storage blocked */ }

// A person is anyone without an unsubscribe header, but also anyone writing from a
// personal mailbox or through a group or list (those add List-Unsubscribe too).
const PERSONAL_DOMAINS = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|uol|bol|terra|ig|zipmail|gmx)\./i;
const isPerson = (m: Mail) =>
  !m.listUnsubscribe || PERSONAL_DOMAINS.test(m.fromEmail) || /\svia\s/i.test(m.fromName) || /@googlegroups\.com$/i.test(m.fromEmail);

/** A black bar about as long as the text. The text itself never reaches the page. */
function redact(text: string): string {
  return `<span class="redact" aria-label="hidden">${'x'.repeat(Math.max(4, Math.min(text.length, 28)))}</span>`;
}
/** A sender name or address: hidden in privacy mode when it is a person. */
function who(text: string, person: boolean): string {
  return privacy && person ? redact(text) : esc(text);
}
/** A subject or preview: always hidden in privacy mode. */
function what(text: string): string {
  return privacy ? redact(text) : esc(text);
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ago(date: number): string {
  const d = Math.floor((Date.now() - date) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

let toastTimer = 0;
function toast(text: string, ms = 1800) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function monster(key: string, w: number, h: number, cls = ''): string {
  return `<canvas class="monster ${cls}" data-key="${esc(key)}" data-w="${w}" data-h="${h}"></canvas>`;
}

/** Draws every monster canvas on screen and keeps their legs moving. */
function animateMonsters() {
  clearInterval(monsterTimer);
  let frame = 0;
  const draw = () => {
    document.querySelectorAll<HTMLCanvasElement>('canvas.monster').forEach((c) =>
      drawMonster(c, c.dataset.key!, +c.dataset.w!, +c.dataset.h!, frame, c.dataset.color || undefined));
    frame++;
  };
  draw();
  monsterTimer = window.setInterval(draw, 420);
}

function button(key: string, label: string, action: string, cls = '', disabled = false) {
  return `<button class="btn ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}><kbd>${key}</kbd><span>${label}</span></button>`;
}

/** Small buttons under the main ones, so phones can undo, mute and quit too. */
function utilityRow() {
  return `
    <div class="mini-row">
      ${needsAuth ? '<button class="mini alert" data-action="reauth"><kbd>G</kbd> RECONNECT</button>' : ''}
      <button class="mini" data-action="undo" ${raid?.canUndo ? '' : 'disabled'}><kbd>Z</kbd> UNDO</button>
      <button class="mini" data-action="mute"><kbd>M</kbd> ${isMuted() ? 'SOUND OFF' : 'SOUND ON'}</button>
      <button class="mini" data-action="quit"><kbd>ESC</kbd> QUIT</button>
    </div>`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- HUD ----------

let shownInbox = 0;
let inboxTween = 0;

function tweenInbox(to: number, ms = 600) {
  cancelAnimationFrame(inboxTween);
  const from = shownInbox;
  const t0 = performance.now();
  const el = $('#inbox-count');
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    shownInbox = from + (to - from) * (1 - (1 - k) ** 3);
    el.textContent = fmt(shownInbox);
    if (k < 1) inboxTween = requestAnimationFrame(step);
  };
  inboxTween = requestAnimationFrame(step);
}

function updateHud() {
  if (!raid) return;
  $('#score').textContent = fmt(raid.score);
  const combo = $('#combo');
  combo.textContent = raid.combo > 1 && view !== 'clear' ? `COMBO x${raid.combo}` : '';
  combo.dataset.level = String(Math.min(raid.combo, 8));
}

let lastTick = performance.now();
function hudLoop(t: number) {
  const dt = Math.min(t - lastTick, 100);
  lastTick = t;
  if (raid && (view === 'boss' || view === 'horde')) {
    if (!busy && !needsAuth && raid.tick(dt)) overload();
    $('#time').textContent = clock(raid.elapsedMs);
    const fill = $('#stress-fill');
    fill.style.width = `${raid.stress}%`;
    fill.classList.toggle('hot', raid.stress > 70);
  }
  requestAnimationFrame(hudLoop);
}
requestAnimationFrame(hudLoop);

// A hidden tab is not hesitation.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { raid?.resetIdle(); lastTick = performance.now(); }
});

function overload() {
  sfx('overload');
  flash('#ff3b3b');
  shake(14, 400);
  stamp('OVERWHELMED!', '#ff3b3b');
  updateHud();
}

// ---------- screens ----------

function showTitle() {
  runId++;
  scanning?.cancel?.();
  scanning = null;
  view = 'title';
  raid = null;
  busy = false;
  needsAuth = false;
  music.stop();
  recStopSoon(300);
  hud.hidden = true;
  const parade = PALETTE.map((c, i) => `<canvas class="monster parade" data-key="parade-${i}" data-w="11" data-h="9" data-color="${c}" style="animation-delay:${i * -0.4}s"></canvas>`).join('');
  const best = readBest();
  screen.innerHTML = `
    <section class="title">
      <div class="parade-row">${parade}</div>
      <h1 class="logo"><span>INBOX</span><span>RAID</span></h1>
      <p class="tagline">Every enemy you kill is an email that <em>really</em> leaves your inbox.</p>
      <div class="how">
        <p><b>BOSSES</b> are senders who flood you. Their HP is how many emails they sent.</p>
        <p><b>THE HORDE</b> is every other email. Decide fast to build combos.</p>
        <p class="dim">Hesitate and your stress bar fills. Nothing is ever permanently deleted.</p>
      </div>
      ${best ? `<p class="best">HIGH SCORE ${fmt(best)}</p>` : ''}
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('ENTER', 'PLAY DEMO', 'demo', 'primary')}
      ${button('G', 'RAID MY GMAIL', 'gmail')}
      ${button('P', `PRIVACY ${privacy ? 'ON' : 'OFF'}`, 'privacy', 'ghost')}
    </div>
    <p class="fine">Demo uses a fake inbox. Gmail mode runs 100% in your browser, no server,<br>and is invite-only while Google reviews the app. Privacy mode blacks out subjects and people.</p>`;
  animateMonsters();
}

function readBest(): number {
  try { return Number(localStorage.getItem('inbox-raid-best') || 0); } catch { return 0; }
}

function writeBest(n: number) {
  try { localStorage.setItem('inbox-raid-best', String(n)); } catch { /* storage blocked */ }
}

/** The high score before this raid ended: saved on the final screen, put back if the player undoes. */
let bestBefore = 0;

async function startRaid(src: InboxSource) {
  const run = ++runId;
  view = 'scan';
  scanning = src;
  hud.hidden = true;
  screen.innerHTML = `
    <section class="scan">
      <p class="blink">SCANNING ${esc(src.label)}...</p>
      <p class="scan-count"><span id="scan-n">0</span> emails</p>
      <div class="scan-bar"><i id="scan-fill"></i></div>
      <p class="scan-note" id="scan-note"></p>
    </section>`;
  controls.innerHTML = `<div class="row">${button('ESC', 'CANCEL', 'quit', 'ghost')}</div>`;
  let mails: Mail[];
  try {
    mails = await src.load((n, total, note) => {
      if (run !== runId) return;
      $('#scan-n').textContent = fmt(n);
      $('#scan-fill').style.width = `${total ? Math.min(100, (n / total) * 100) : 0}%`;
      const left = Math.ceil((total - n) / 4);
      $('#scan-note').textContent = note || (!src.isDemo && left > 5 ? `Reading gently to respect Gmail limits, about ${left}s left` : '');
      if (n % 5 === 0) sfx('tick', 1 + (n % 50) / 50);
    });
  } catch (err) {
    if (run !== runId) return;
    console.error(err);
    toast(err instanceof AuthExpiredError ? 'Google session expired. Try again.' : 'Could not read the inbox. Try again.', 3000);
    showTitle();
    return;
  }
  if (run !== runId) return;
  scanning = null;
  const { bosses, horde, overflow } = splitInbox(mails);
  const outside = Math.max(0, src.inboxTotal - mails.length) + overflow;
  source = src;
  controls.innerHTML = '';
  raid = new Raid(bosses, horde, outside);
  screen.innerHTML = `
    <section class="scan">
      <p class="scan-count">${fmt(raid.inboxStart)} emails</p>
      <p class="found"><b>${bosses.length}</b> BOSSES &middot; <b>${horde.length}</b> IN THE HORDE</p>
      ${outside ? `<p class="found dim">${fmt(outside)} more wait for the next raid</p>` : ''}
      <p class="blink ready">READY?</p>
    </section>`;
  shownInbox = raid.inboxStart;
  $('#inbox-count').textContent = fmt(shownInbox);
  await wait(1400);
  if (run !== runId) return;
  hud.hidden = false;
  raid.startedAt = performance.now();
  raid.resetIdle();
  updateHud();
  recStart();
  stamp('FIGHT!', '#ffd23f');
  sfx('boom');
  next();
}

/** Routes to whatever the raid needs next. */
function next() {
  if (!raid) return;
  if (raid.phase === 'done') return showClear();
  // Bosses at 132 bpm, the horde faster; an undo across phases switches back.
  const bpm = raid.phase === 'boss' ? 132 : 152;
  if (music.playing && music.bpm !== bpm) music.stop();
  if (!music.playing) music.start(bpm);
  if (raid.phase === 'boss') showBoss();
  else showHorde();
}

function showBoss() {
  const r = raid!;
  const boss = r.boss!;
  view = 'boss';
  armedAt = performance.now() + ARM_BOSS_MS;
  const color = colorFor(boss.key);
  const hp = boss.mails.length;
  const samples = [...new Set(boss.mails.map((m) => m.subject))].slice(0, 3);
  const plan = unsubPlan(boss.mails.find((m) => m.listUnsubscribe));
  const person = boss.mails.some(isPerson);
  const tag = {
    'one-click': 'UNSUBSCRIBE AVAILABLE: CRITICAL HIT',
    mailto: `UNSUBSCRIBE EMAIL TO ${who(mailtoAddress(plan.url), person)}: CRITICAL HIT`,
    link: 'UNSUBSCRIBE OPENS THEIR PAGE (archive + you finish it)',
    none: 'No unsubscribe link from this sender',
  }[plan.kind];
  screen.innerHTML = `
    <section class="boss" style="--c:${color}">
      <p class="label">BOSS ${r.bossIdx + 1} / ${r.bosses.length}</p>
      <div class="boss-sprite">${monster(boss.key, 11, 9, 'big')}</div>
      <h2 class="boss-name">${who(boss.name, person)}</h2>
      <p class="boss-email">${who(boss.email, person)}</p>
      <div class="hp"><span>HP</span><div class="hp-bar"><i id="hp-fill"></i></div><b id="hp-n">${fmt(hp)}</b></div>
      <ul class="attacks">${samples.map((s) => `<li>&gt; ${what(s)}</li>`).join('')}</ul>
      <p class="tag ${plan.kind === 'none' ? 'dim' : ''}">${tag}</p>
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('A', 'ARCHIVE ALL', 'archive')}
      ${button('U', 'UNSUBSCRIBE', 'unsubscribe', 'crit', plan.kind === 'none')}
      ${button('D', 'TRASH ALL', 'trash', 'danger')}
      ${button('S', 'SPARE', 'spare', 'ghost')}
    </div>
    ${utilityRow()}`;
  animateMonsters();
  sfx('boss');
}

async function bossMove(move: BossMove) {
  const r = raid!;
  const boss = r.boss;
  if (!boss) return;
  const src = source;
  const run = runId;
  let plan: UnsubPlan | undefined;
  let linkOnly = false;
  if (move === 'unsubscribe') {
    plan = unsubPlan(boss.mails.find((m) => m.listUnsubscribe));
    if (plan.kind === 'none') return;
    if (plan.kind === 'link') {
      // Opened right now, inside the key press, so the browser does not block it.
      // The player finishes on their page; the game only archives and gives no critical.
      window.open(plan.url, '_blank', 'noopener');
      linkOnly = true;
      move = 'archive';
    }
  }
  busy = true;
  const sprite = $('.boss-sprite');
  const [x, y] = centreOf(sprite);
  const color = colorFor(boss.key);
  const hit = r.hitBoss(move)!;
  updateHud();

  if (move === 'spare') {
    sfx('spare');
    sprite.classList.add('walk-off');
    floatText(x, y, 'SPARED', '#9aa0c8', 16);
    await wait(500);
  } else {
    sprite.classList.add('hurt');
    const n = hit.ids.length;
    const drainMs = Math.min(700, 250 + n * 3);
    drainSfx(n, drainMs);
    $('#hp-fill').style.transition = `width ${drainMs}ms linear`;
    $('#hp-fill').style.width = '0%';
    countDown($('#hp-n'), n, drainMs);
    tweenInbox(r.inboxLeft, drainMs);
    await wait(drainMs);
    if (run !== runId) return;
    sprite.classList.add('dead');
    const crit = move === 'unsubscribe';
    sfx(crit ? 'boom' : move === 'trash' ? 'trash' : 'hit');
    burst(x, y, color, crit ? 90 : 50, crit ? 11 : 8, crit ? 9 : 7);
    burst(x, y, '#ffffff', 20, 5, 4);
    shake(crit ? 18 : 10, crit ? 500 : 300);
    if (crit) flash(color);
    if (hit.combo > 1) comboSfx(hit.combo);
    stamp(crit ? 'CRITICAL HIT!' : move === 'trash' ? 'TRASHED!' : 'ARCHIVED!', crit ? '#ffd23f' : color);
    floatText(x, y - 40, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, '#ffd23f', 22);
    // A browser cannot see whether the sender honours it, so the game never says "gone forever".
    if (crit) floatText(x, y + 10, 'UNSUBSCRIBE SENT', '#fff', 14);
    if (linkOnly) toast('Finish the unsubscribe in the tab that just opened', 3000);
    await wait(crit ? 700 : 450);
  }
  const t0 = performance.now();
  await apply(hit, src, run, plan);
  if (run !== runId) return;
  r.waited(performance.now() - t0);
  busy = false;
  if (r.phase === 'horde' && r.bossIdx === r.bosses.length && r.hordeIdx === 0) {
    stamp('HORDE INCOMING!', '#ff2e88');
    music.stop();
  }
  next();
}

function showHorde() {
  const r = raid!;
  const mail = r.mail!;
  view = 'horde';
  armedAt = performance.now() + ARM_CARD_MS;
  const behind = r.horde.slice(r.hordeIdx + 1, r.hordeIdx + 3);
  screen.innerHTML = `
    <section class="horde">
      <p class="label">HORDE ${r.hordeIdx + 1} / ${r.horde.length}</p>
      <div class="deck">
        ${behind.map((_, i) => `<div class="card ghost-card" style="--i:${i + 1}"></div>`).reverse().join('')}
        ${card(mail)}
      </div>
    </section>`;
  controls.innerHTML = `
    <div class="row three">
      ${button('&larr;', 'ARCHIVE', 'archive')}
      ${button('&darr;', 'TRASH', 'trash', 'danger')}
      ${button('&rarr;', 'QUEST &#9733;', 'star', 'crit')}
    </div>
    ${utilityRow()}`;
  animateMonsters();
  bindSwipe($('.card.live'));
}

function card(m: Mail): string {
  const c = colorFor(m.fromEmail);
  // One-off senders are too often people (even with a company address): always hidden in privacy mode.
  const person = true;
  return `
    <article class="card live" style="--c:${c}">
      <header>${monster(m.fromEmail, 11, 9, 'small')}<div><b>${who(m.fromName, person)}</b><small>${who(m.fromEmail, person)}</small></div><time>${ago(m.date)}</time></header>
      <h3>${what(m.subject || '(no subject)')}</h3>
      ${m.snippet ? `<p>${what(m.snippet)}</p>` : ''}
    </article>`;
}

async function hordeMove(move: HordeMove) {
  const r = raid!;
  if (!r.mail) return;
  const src = source;
  const run = runId;
  busy = true;
  const el = $('.card.live');
  const [x, y] = centreOf(el);
  const comboBefore = r.combo;
  const hit = r.hitMail(move)!;
  updateHud();
  tweenInbox(r.inboxLeft, 250);
  el.classList.add(`fly-${move}`);
  const color = move === 'trash' ? '#ff3b3b' : move === 'star' ? '#ffd23f' : colorFor(hit.mail!.fromEmail);
  burst(x, y, color, 22 + hit.combo * 4, 6, 6);
  sfx(move === 'trash' ? 'trash' : move === 'star' ? 'coin' : 'hit', 1 + hit.combo * 0.04);
  if (hit.combo > 1) comboSfx(hit.combo);
  shake(3 + hit.combo, 150);
  floatText(x, y - 30, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, '#ffd23f', 16 + hit.combo);
  // Stamped once on the way up, not on every card while the combo stays maxed.
  if ((hit.combo === 5 || hit.combo === 8) && comboBefore < hit.combo) stamp(hit.combo === 8 ? 'MAX COMBO!' : 'COMBO x5!', '#3cff7a');
  await wait(170);
  const t0 = performance.now();
  await apply(hit, src, run);
  if (run !== runId) return;
  r.waited(performance.now() - t0);
  busy = false;
  next();
}

function showClear() {
  const r = raid!;
  view = 'clear';
  music.stop();
  fanfare();
  recStopSoon();
  // Leftover stamps and score pops must not cover the result.
  document.querySelectorAll('.stamp, .float-text').forEach((el) => el.remove());
  hud.hidden = false;
  updateHud();
  // Saved now, so closing the tab keeps it; an undo from here puts the old one back.
  bestBefore = readBest();
  if (r.score > bestBefore) writeBest(r.score);
  renderClear();
  burst(innerWidth / 2, innerHeight / 3, '#ffd23f', 80, 10, 8);
  burst(innerWidth / 2, innerHeight / 3, '#ff2e88', 60, 8, 7);
  if (source.countInbox) checkInbox(r, runId);
}

/** Emails can arrive (or leave) during a raid: INBOX ZERO only if Gmail agrees. */
async function checkInbox(r: Raid, run: number) {
  try {
    await wait(1500); // let Gmail settle the last move first
    if (run !== runId || view !== 'clear') return;
    const real = await source.countInbox!();
    if (run !== runId || view !== 'clear' || raid !== r || real === r.inboxLeft) return;
    r.inboxLeft = real;
    shownInbox = real;
    $('#inbox-count').textContent = fmt(real);
    renderClear();
  } catch (err) {
    console.warn('Could not recount the inbox', err);
  }
}

function renderClear() {
  const r = raid!;
  const cleared = r.stats.archived + r.stats.trashed + r.stats.starred;
  const zero = r.inboxLeft === 0;
  const QUESTS_SHOWN = 5;
  // In privacy mode the link must not show the account address in the status bar.
  const inboxUrl = privacy ? 'https://mail.google.com/mail/u/0/#inbox' : source.inboxUrl;
  screen.innerHTML = `
    <section class="clear">
      <h1 class="logo small"><span>${zero ? 'INBOX ZERO' : 'STAGE CLEAR'}</span></h1>
      ${r.score > bestBefore ? '<p class="best blink">NEW HIGH SCORE!</p>' : ''}
      <p class="before-after"><b>${fmt(r.inboxStart)}</b> <span>&rarr;</span> <b>${fmt(r.inboxLeft)}</b></p>
      ${!zero && r.outside ? `<p class="proof">${fmt(r.outside)} emails were outside this raid. Raid again to keep going.</p>` : ''}
      <dl class="stats">
        <div><dt>EMAILS CLEARED</dt><dd>${fmt(cleared)}</dd></div>
        <div><dt>BOSSES DOWN</dt><dd>${r.stats.bossesDown}/${r.bosses.length}</dd></div>
        <div><dt>UNSUBS SENT</dt><dd>${r.stats.unsubscribed}</dd></div>
        <div><dt>MAX COMBO</dt><dd>x${r.stats.maxCombo}</dd></div>
        <div><dt>TIME</dt><dd>${clock(r.elapsedMs)}</dd></div>
        <div><dt>SCORE</dt><dd>${fmt(r.score)}</dd></div>
      </dl>
      ${r.quests.length ? `
        <div class="quests"><p class="label">QUEST LOG &middot; starred, waiting for you in Starred</p>
        <ul>${r.quests.slice(0, QUESTS_SHOWN).map((m) => `<li>&#9733; <b>${who(m.fromName, true)}</b> ${what(m.subject)}</li>`).join('')}
        ${r.quests.length > QUESTS_SHOWN ? `<li class="dim">+${r.quests.length - QUESTS_SHOWN} more in Starred</li>` : ''}</ul></div>` : ''}
      <p class="proof">${source.isDemo
        ? 'Demo mode: nothing real was touched. Imagine this was your inbox.'
        : `This was your real inbox. <a href="${esc(inboxUrl)}" target="_blank" rel="noopener">Go check it &rarr;</a>`}</p>
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('C', 'SHARE CARD', 'card', 'crit')}
      ${button('R', 'PLAY AGAIN', 'again', 'primary')}
      ${button('ESC', 'TITLE', 'title', 'ghost')}
    </div>
    <div class="mini-row">
      ${needsAuth ? '<button class="mini alert" data-action="reauth"><kbd>G</kbd> RECONNECT</button>' : ''}
      <button class="mini" data-action="undo" ${r.canUndo ? '' : 'disabled'}><kbd>Z</kbd> UNDO LAST HIT</button>
      <button class="mini" data-action="privacy"><kbd>P</kbd> PRIVACY ${privacy ? 'ON' : 'OFF'}</button>
    </div>`;
}

// ---------- applying to the inbox ----------

/** Applies a hit to the inbox it came from. On failure the game rolls back. */
async function apply(hit: Hit, src: InboxSource, run: number, plan?: UnsubPlan) {
  try {
    if (hit.kind === 'archive') await src.archive(hit.ids);
    else if (hit.kind === 'trash') await src.trash(hit.ids);
    else if (hit.kind === 'star') await src.star(hit.ids);
    else if (hit.kind === 'unsubscribe') {
      // A failed unsubscribe must not cost the archive: the emails still leave the inbox.
      try {
        const res = plan ? await src.unsubscribe(plan) : { ok: false };
        if (!res.ok) {
          if (run === runId) raid?.unsubFailed(hit);
          toast('Could not unsubscribe automatically. Emails archived.', 3000);
        }
      } catch (err) {
        if (err instanceof AuthExpiredError) throw err;
        console.error(err);
        if (run === runId) raid?.unsubFailed(hit);
        toast('Unsubscribe failed. Emails archived anyway.', 3000);
      }
      await src.archive(hit.ids);
    }
  } catch (err) {
    console.error(err);
    if (run !== runId) return;
    raid?.undo();
    tweenInbox(raid?.inboxLeft ?? 0, 300);
    updateHud();
    if (err instanceof AuthExpiredError) {
      needsAuth = true;
      toast('Google session expired. Press G to reconnect.', 4000);
    } else {
      toast('Gmail did not accept that. Rolled back, try again.', 3000);
    }
  }
}

/** Undo fixes the inbox first; the game only rolls back if the inbox really changed. */
async function undo() {
  if (!raid || busy) return;
  const hit = raid.peekUndo();
  if (!hit) return;
  const run = runId;
  const fromClear = view === 'clear';
  busy = true;
  try {
    if (hit.kind !== 'spare') await source.undo(hit.kind, hit.ids);
    if (run !== runId) return;
    raid.undo();
    if (fromClear) {
      // Back to the fight: the old high score returns and the recording goes on.
      writeBest(bestBefore);
      recKeepGoing();
    }
    sfx('undo');
    // Gmail can put the emails back; an unsubscribe already sent cannot be called back.
    toast(hit.kind === 'unsubscribe' && !source.isDemo ? 'Emails are back. The unsubscribe request was already sent.' : 'UNDONE', hit.kind === 'unsubscribe' ? 3500 : 1800);
  } catch (err) {
    console.error(err);
    if (err instanceof AuthExpiredError) needsAuth = true;
    toast(err instanceof AuthExpiredError ? 'Google session expired. Press G to reconnect.' : 'Undo failed in Gmail. Nothing changed.', 3000);
  }
  if (run !== runId) return;
  tweenInbox(raid.inboxLeft, 300);
  updateHud();
  busy = false;
  // A failed undo on the final screen stays there, without replaying the fanfare.
  if (raid.phase === 'done' && view === 'clear') renderClear();
  else next();
}

function countDown(el: HTMLElement, from: number, ms: number) {
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmt(from * (1 - k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- input ----------

const MOVES = new Set(['archive', 'unsubscribe', 'trash', 'spare', 'star']);

function act(action: string) {
  unlockAudio();
  if (action === 'mute') {
    const m = toggleMute();
    toast(m ? 'SOUND OFF' : 'SOUND ON');
    if (!m && (view === 'boss' || view === 'horde')) music.start();
    document.querySelectorAll('.mini[data-action="mute"]').forEach((b) => (b.innerHTML = `<kbd>M</kbd> ${m ? 'SOUND OFF' : 'SOUND ON'}`));
    return;
  }
  // Esc always gets out, even while Gmail is slow to answer.
  if (action === 'quit' && (view === 'boss' || view === 'horde')) {
    toast('Raid stopped. Everything you hit stays done.');
    return showTitle();
  }
  // No queue: a key pressed during an animation is dropped, never applied to an email the
  // player has not seen yet.
  if (busy) return;
  switch (view) {
    case 'title':
      if (action === 'demo') { sfx('select'); startRaid(new DemoSource()); }
      if (action === 'gmail' && !signingIn) raidGmail();
      if (action === 'privacy') { togglePrivacy(); showTitle(); }
      return;
    case 'scan':
      if (action === 'quit') { toast('Scan cancelled'); showTitle(); }
      return;
    case 'boss':
    case 'horde': {
      // Forgot privacy before recording? P works mid-raid and redraws the screen,
      // without giving the boss a fresh entrance delay.
      if (action === 'privacy') {
        togglePrivacy();
        const armed = armedAt;
        if (view === 'boss') showBoss(); else showHorde();
        armedAt = armed;
        return;
      }
      if (action === 'undo') return void undo();
      if (action === 'reauth') return void reconnect();
      if (!MOVES.has(action)) return;
      if (needsAuth) return toast('Google session expired. Press G to reconnect.', 3000);
      if (performance.now() < armedAt) return;
      if (view === 'boss') bossMove(action as BossMove);
      else hordeMove(action as HordeMove);
      return;
    }
    case 'clear':
      if (action === 'undo') return void undo();
      if (action === 'reauth') return void reconnect();
      if (action === 'privacy') { togglePrivacy(); return renderClear(); }
      if (action === 'card' && raid && !makingCard) {
        makingCard = true;
        sfx('coin');
        renderShareCard(raid, source.isDemo)
          .then(shareCard)
          .then((how) => { if (how !== 'cancelled') toast(how === 'shared' ? 'Shared!' : 'Card saved: inbox-raid.png', 2500); })
          .catch((err) => { console.error(err); toast('Could not make the card'); })
          .finally(() => { makingCard = false; });
      }
      if (action === 'again') startRaid(source.isDemo ? new DemoSource() : source);
      if (action === 'title') showTitle();
      return;
  }
}

/** One card at a time: pressing C again while it is being made does nothing. */
let makingCard = false;

function togglePrivacy() {
  privacy = !privacy;
  try { localStorage.setItem('inbox-raid-privacy', privacy ? '1' : '0'); } catch { /* storage blocked */ }
  sfx('select');
  toast(privacy ? 'PRIVACY ON: subjects and people are blacked out' : 'PRIVACY OFF');
}

/** Google's consent popup needs a user gesture, so this runs straight from the click or key. */
async function raidGmail() {
  signingIn = true;
  sfx('select');
  toast('Opening Google sign-in...', 4000);
  try {
    const token = await signIn();
    if (view !== 'title') return;
    const gmail = new GmailSource(token);
    // During the raid a slow Gmail says so, instead of a silent freeze.
    gmail.onWait = (note) => toast(note, 3000);
    startRaid(gmail);
  } catch (err) {
    console.error(err);
    toast(String((err as Error).message).includes('not granted') ? 'Gmail access was not granted' : 'Sign-in cancelled or blocked', 3000);
  } finally {
    signingIn = false;
  }
}

async function reconnect() {
  if (!(source instanceof GmailSource) || !needsAuth || signingIn) return;
  signingIn = true;
  try {
    source.setToken(await signIn());
    needsAuth = false;
    raid?.resetIdle();
    toast('Reconnected. Keep raiding!');
    // Redraw without the RECONNECT button.
    if (view === 'clear') renderClear();
    else if ((view === 'boss' || view === 'horde') && !busy) {
      const armed = armedAt;
      if (view === 'boss') showBoss(); else showHorde();
      armedAt = armed;
    }
  } catch (err) {
    console.error(err);
    toast('Still disconnected. Press G to try again.', 3000);
  } finally {
    signingIn = false;
  }
}

const KEYS: Record<string, Record<string, string>> = {
  title: { Enter: 'demo', ' ': 'demo', g: 'gmail', p: 'privacy' },
  boss: { a: 'archive', u: 'unsubscribe', d: 'trash', s: 'spare', ArrowLeft: 'archive', ArrowDown: 'trash', Escape: 'quit', g: 'reauth', p: 'privacy' },
  horde: { ArrowLeft: 'archive', a: 'archive', ArrowDown: 'trash', d: 'trash', ArrowRight: 'star', s: 'star', Escape: 'quit', g: 'reauth', p: 'privacy' },
  scan: { Escape: 'quit' },
  clear: { r: 'again', Enter: 'again', Escape: 'title', c: 'card', g: 'reauth', p: 'privacy' },
};

addEventListener('keydown', (e) => {
  // Holding a key must not fire a stream of hits on a real inbox.
  if (e.repeat) return;
  if (e.metaKey || e.ctrlKey || e.altKey) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); act('undo'); }
    return;
  }
  // Enter or Space on a focused button is that button's click, not the screen shortcut.
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement instanceof HTMLButtonElement) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'z') return act('undo');
  if (k === 'm') return act('mute');
  const action = KEYS[view]?.[k];
  if (action) { e.preventDefault(); act(action); }
});

controls.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (btn && !btn.disabled) act(btn.dataset.action!);
});

// Google's sign-in script loads only when someone reaches for the Gmail button.
const warmGoogle = (e: Event) => {
  if ((e.target as HTMLElement).closest?.('button[data-action="gmail"]')) preloadGoogle();
};
controls.addEventListener('pointerover', warmGoogle);
controls.addEventListener('focusin', warmGoogle);

/** Phone controls: swipe the card left (archive), down (trash) or right (quest). */
function bindSwipe(el: HTMLElement) {
  let x0 = 0, y0 = 0, active = false;
  const reset = () => { active = false; el.style.transform = ''; };
  el.addEventListener('pointerdown', (e) => { active = true; x0 = e.clientX; y0 = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    el.style.transform = `translate(${e.clientX - x0}px, ${Math.max(0, e.clientY - y0)}px) rotate(${(e.clientX - x0) / 20}deg)`;
  });
  el.addEventListener('pointercancel', reset);
  el.addEventListener('pointerup', (e) => {
    if (!active) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    reset();
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'archive' : 'star');
    else if (dy > 70 && dy > Math.abs(dx)) act('trash');
  });
}

showTitle();
