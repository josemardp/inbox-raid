// Fonts bundled with the site (OFL), so no visitor's IP goes to a font CDN.
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-grotesk/latin-ext-500.css';
import '@fontsource/space-grotesk/latin-ext-700.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '@fontsource/dm-mono/latin-ext-400.css';
import '@fontsource/dm-mono/latin-ext-500.css';
import './style.css';
import { comboSfx, drainSfx, fanfare, isMuted, music, sfx, toggleMute, unlockAudio } from './audio';
import { makeDial } from './dials';
import { DemoSource } from './demoSource';
import { GmailSource, preloadGoogle, signIn } from './gmailSource';
import { burst, centreOf, flash, floatText, initFx, shake, stamp } from './fx';
import { fmt, lang, setLang, t } from './i18n';
import { Raid, splitInbox, type BossMove, type Hit, type HordeMove } from './raid';
import { recKeepGoing, recStart, recStopSoon } from './recorder';
import { renderShareCard, shareCard } from './shareCard';
import { colorFor, drawMonster, PALETTE } from './sprites';
import { AuthExpiredError, mailtoAddress, unsubPlan, type InboxSource, type Mail, type UnsubPlan } from './types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const screen = $('#screen');
const controls = $('#controls');
const hud = $('#hud');
const arena = $('#arena');
const stack = $('#stack');
initFx($<HTMLCanvasElement>('#fx'), $('#stage'));
setLang(lang);

const dialInbox = makeDial($('#dial-inbox') as unknown as SVGSVGElement, { ticks: 10, big: true });
const dialStress = makeDial($('#dial-stress') as unknown as SVGSVGElement, { ticks: 10, red: 0.7, needle: true });

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

// Effect colours, from the same palette as the page.
const CYAN = '#75dbf3';
const BLUE = '#4aa3ff';
const CORAL = '#ff6e67';
const WHITE = '#f2f7fd';

// ---------- helpers ----------

/** Mail data can come from a real inbox: always escape before innerHTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

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
  return d <= 0 ? t('ago.today') : d === 1 ? t('ago.one') : t('ago.many', { d });
}

let toastTimer = 0;
function toast(text: string, ms = 1800) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

function monster(key: string, cls = '', color = ''): string {
  return `<canvas class="monster ${cls}" data-key="${esc(key)}"${color ? ` data-color="${color}"` : ''}></canvas>`;
}

/** Draws every monster on screen and keeps their legs moving. */
function animateMonsters() {
  clearInterval(monsterTimer);
  let frame = 0;
  const draw = () => {
    document.querySelectorAll<HTMLCanvasElement>('canvas.monster').forEach((c) =>
      drawMonster(c, c.dataset.key!, 11, 9, frame, c.dataset.color || undefined, 20));
    frame++;
  };
  draw();
  monsterTimer = window.setInterval(draw, 420);
}

/** The radar the monsters live in: rings, a slow orbit arc and a scan line. */
function orbit(inner: string, tag = '', cls = ''): string {
  return `
    <section class="panel orbit ${cls}">
      ${tag ? `<p class="orbit-tag">${tag}</p>` : ''}
      <div class="rings" aria-hidden="true"><i class="ring r1"></i><i class="ring r2"></i><i class="arc"></i><i class="axis"></i><i class="node"></i></div>
      <div class="core">${inner}</div>
    </section>`;
}

function button(key: string, label: string, action: string, cls = '', disabled = false) {
  return `<button class="btn ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}><kbd>${key}</kbd><span>${label}</span></button>`;
}

function langSwitch() {
  return `<button class="mini lang" data-action="lang" aria-label="Language"><kbd>L</kbd> <b class="${lang === 'en' ? 'on' : ''}">EN</b> / <b class="${lang === 'pt' ? 'on' : ''}">PT</b></button>`;
}

/** Small buttons under the main ones, so phones can undo, mute and quit too. */
function utilityRow() {
  return `
    <div class="mini-row">
      <div class="mini-group">
        ${needsAuth ? `<button class="mini alert" data-action="reauth"><kbd>G</kbd> ${t('reconnect')}</button>` : ''}
        <button class="mini" data-action="undo" ${raid?.canUndo ? '' : 'disabled'}><kbd>Z</kbd> ${t('undo')}</button>
        <button class="mini" data-action="mute"><kbd>M</kbd> ${isMuted() ? t('sound.off') : t('sound.on')}</button>
        <button class="mini" data-action="privacy"><kbd>P</kbd> ${privacy ? t('privacy.on') : t('privacy.off')}</button>
        <button class="mini" data-action="quit"><kbd>ESC</kbd> ${t('quit')}</button>
      </div>
      ${langSwitch()}
    </div>`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- layout ----------

/** Fight screens show the console of dials between the two panels; the rest use the full width. */
function layout(v: typeof view) {
  view = v;
  const fight = v === 'boss' || v === 'horde';
  arena.className = fight ? 'fight' : 'wide';
  stack.hidden = !fight;
  hud.hidden = !(fight || v === 'clear');
}

function staticLabels() {
  $('#hud-score-label').textContent = t('hud.score');
  $('#hud-time-label').textContent = t('hud.time');
  $('#dial-inbox-label').textContent = t('hud.inbox');
  $('#dial-stress-label').textContent = t('hud.stress');
  $('#gear-label').textContent = t('hud.combo');
}
staticLabels();

// ---------- HUD ----------

let shownInbox = 0;
let inboxTween = 0;

function tweenInbox(to: number, ms = 600) {
  cancelAnimationFrame(inboxTween);
  const from = shownInbox;
  const t0 = performance.now();
  const step = (tm: number) => {
    const k = Math.min(1, (tm - t0) / ms);
    shownInbox = from + (to - from) * (1 - (1 - k) ** 3);
    if (k < 1) inboxTween = requestAnimationFrame(step);
  };
  inboxTween = requestAnimationFrame(step);
}

function updateHud() {
  if (!raid) return;
  $('#score').textContent = fmt(raid.score);
  const combo = $('#combo');
  combo.textContent = `x${raid.combo}`;
  const gear = combo.parentElement!;
  gear.classList.toggle('hot', raid.combo >= 5 && view !== 'clear');
  gear.classList.toggle('max', raid.combo >= 8 && view !== 'clear');
}

let lastTick = performance.now();
function hudLoop(tm: number) {
  const dt = Math.min(tm - lastTick, 100);
  lastTick = tm;
  if (raid && (view === 'boss' || view === 'horde')) {
    if (!busy && !needsAuth && raid.tick(dt)) overload();
    $('#time').textContent = clock(raid.elapsedMs);
    dialStress.update(raid.stress / 100);
  }
  if (raid && !stack.hidden) {
    const start = Math.max(1, raid.inboxStart);
    dialInbox.update(shownInbox / start, fmt(shownInbox), t('hud.of', { n: fmt(raid.inboxStart) }));
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
  flash(CORAL);
  shake(14, 400);
  stamp(t('fx.overload'), CORAL);
  updateHud();
}

// ---------- screens ----------

function showTitle() {
  runId++;
  scanning?.cancel?.();
  scanning = null;
  layout('title');
  raid = null;
  busy = false;
  needsAuth = false;
  music.stop();
  recStopSoon(300);
  const parade = PALETTE.map((c, i) => monster(`parade-${i}`, 'parade', c)).join('');
  const best = readBest();
  screen.innerHTML = `
    ${orbit(`${monster('inbox-raid', 'hero', CYAN)}<div class="parade-row">${parade}</div>`, 'ARCADE · GMAIL', 'title-orbit')}
    <section class="panel brief title">
      <p class="eyebrow">${t('title.eyebrow')}</p>
      <h1 class="logo">INBOX <span>RAID</span></h1>
      <p class="tagline">${t('title.tagline')}</p>
      <ul class="how">
        <li><span>${t('title.how.bosses')}</span></li>
        <li><span>${t('title.how.horde')}</span></li>
        <li class="dim"><span>${t('title.how.safe')}</span></li>
      </ul>
      ${best ? `<p class="best">${t('title.best')} <b>${fmt(best)}</b></p>` : ''}
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('ENTER', t('title.demo'), 'demo', 'primary')}
      ${button('G', t('title.gmail'), 'gmail')}
      ${button('P', privacy ? t('privacy.on') : t('privacy.off'), 'privacy', 'ghost')}
    </div>
    <div class="mini-row">
      <p class="fine">${t('title.fine')}</p>
      <div class="mini-group">
        <button class="mini" data-action="mute"><kbd>M</kbd> ${isMuted() ? t('sound.off') : t('sound.on')}</button>
        ${langSwitch()}
      </div>
    </div>`;
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

function segments(n: number, id = ''): string {
  return `<div class="segbar" ${id ? `id="${id}"` : ''} style="--n:${n}">${'<i></i>'.repeat(n)}</div>`;
}

async function startRaid(src: InboxSource) {
  const run = ++runId;
  layout('scan');
  scanning = src;
  screen.innerHTML = `
    ${orbit(monster('scan', 'hero', CYAN), src.isDemo ? 'DEMO' : 'GMAIL', 'scanning')}
    <section class="panel brief scan">
      <p class="eyebrow blink">${src.isDemo ? t('scan.demo') : t('scan.gmail')}</p>
      <p class="scan-count"><span id="scan-n">0</span> <small>${t('scan.emails')}</small></p>
      <div class="scan-bar"><i id="scan-fill"></i></div>
      <p class="scan-note" id="scan-note"></p>
    </section>`;
  controls.innerHTML = `<div class="row">${button('ESC', t('cancel'), 'quit', 'ghost')}</div>`;
  animateMonsters();
  let mails: Mail[];
  try {
    mails = await src.load((n, total, note) => {
      if (run !== runId) return;
      $('#scan-n').textContent = fmt(n);
      $('#scan-fill').style.width = `${total ? Math.min(100, (n / total) * 100) : 0}%`;
      const left = Math.ceil((total - n) / 4);
      $('#scan-note').textContent = note || (!src.isDemo && left > 5 ? t('scan.gentle', { s: left }) : '');
      if (n % 5 === 0) sfx('tick', 1 + (n % 50) / 50);
    });
  } catch (err) {
    if (run !== runId) return;
    console.error(err);
    toast(err instanceof AuthExpiredError ? t('toast.expiredRetry') : t('toast.readFail'), 3000);
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
  $('.brief.scan').innerHTML = `
    <p class="eyebrow">${src.isDemo ? t('scan.demo') : t('scan.gmail')}</p>
    <p class="scan-count">${fmt(raid.inboxStart)} <small>${t('scan.emails')}</small></p>
    <p class="found">${t('scan.found', { b: bosses.length, h: horde.length })}</p>
    ${outside ? `<p class="found dim">${t('scan.outside', { n: fmt(outside) })}</p>` : ''}
    <p class="ready blink">${t('scan.ready')}</p>`;
  shownInbox = raid.inboxStart;
  await wait(1400);
  if (run !== runId) return;
  raid.startedAt = performance.now();
  raid.resetIdle();
  recStart();
  stamp(t('fx.fight'), CYAN);
  sfx('boom');
  next();
  updateHud();
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
  layout('boss');
  armedAt = performance.now() + ARM_BOSS_MS;
  const color = colorFor(boss.key);
  const hp = boss.mails.length;
  const samples = [...new Set(boss.mails.map((m) => m.subject))].slice(0, 3);
  const plan = unsubPlan(boss.mails.find((m) => m.listUnsubscribe));
  const person = boss.mails.some(isPerson);
  const tag = {
    'one-click': t('boss.tag.oneclick'),
    mailto: t('boss.tag.mailto', { to: who(mailtoAddress(plan.url), person) }),
    link: t('boss.tag.link'),
    none: t('boss.tag.none'),
  }[plan.kind];
  screen.innerHTML = `
    ${orbit(`<div class="boss-sprite">${monster(boss.key, 'big', color)}</div>`, `${t('boss.label')} <b>${r.bossIdx + 1} / ${r.bosses.length}</b>`)}
    <section class="panel brief boss">
      <p class="eyebrow">${person ? t('boss.person') : t('boss.bulk')}</p>
      <h1 class="boss-name">${who(boss.name, person)}</h1>
      <p class="email">${who(boss.email, person)}</p>
      <div class="hp">
        <span class="hp-label">${t('boss.hp')}</span>
        <strong class="hp-count"><span id="hp-n">${fmt(hp)}</span> / ${fmt(hp)}</strong>
        ${segments(Math.min(hp, 20), 'hpbar')}
      </div>
      <ul class="attacks" aria-label="${t('boss.attacks')}">${samples.map((s) => `<li>${what(s || t('horde.nosubject'))}</li>`).join('')}</ul>
      <p class="critical ${plan.kind === 'none' ? 'dim' : ''}"><span>${tag}</span></p>
    </section>`;
  controls.innerHTML = `
    <div class="row four">
      ${button('A', t('boss.archive'), 'archive')}
      ${button('U', t('boss.unsub'), 'unsubscribe', 'primary', plan.kind === 'none')}
      ${button('D', t('boss.trash'), 'trash', 'danger')}
      ${button('S', t('boss.spare'), 'spare', 'ghost')}
    </div>
    ${utilityRow()}`;
  animateMonsters();
  sfx('boss');
}

/** Turns the HP segments off one by one while the number counts down. */
function drainHp(ms: number) {
  const segs = [...document.querySelectorAll<HTMLElement>('#hpbar i')];
  segs.forEach((s, i) => {
    s.style.transitionDelay = `${Math.round(((segs.length - 1 - i) / Math.max(1, segs.length)) * ms)}ms`;
    s.classList.add('off');
  });
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
  pressButton(move);
  const sprite = $('.boss-sprite');
  const [x, y] = centreOf(sprite);
  const color = colorFor(boss.key);
  const hit = r.hitBoss(move)!;
  updateHud();

  if (move === 'spare') {
    sfx('spare');
    sprite.classList.add('walk-off');
    floatText(x, y, t('fx.spared'), '#9fb2cc', 20);
    await wait(500);
  } else {
    sprite.classList.add('hurt');
    const n = hit.ids.length;
    const drainMs = Math.min(700, 250 + n * 3);
    drainSfx(n, drainMs);
    drainHp(drainMs);
    countDown($('#hp-n'), n, drainMs);
    tweenInbox(r.inboxLeft, drainMs);
    await wait(drainMs);
    if (run !== runId) return;
    sprite.classList.add('dead');
    const crit = move === 'unsubscribe';
    sfx(crit ? 'boom' : move === 'trash' ? 'trash' : 'hit');
    burst(x, y, crit ? BLUE : color, crit ? 90 : 50, crit ? 11 : 8, crit ? 9 : 7);
    burst(x, y, WHITE, 20, 5, 4);
    shake(crit ? 18 : 10, crit ? 500 : 300);
    if (crit) flash(CYAN);
    if (hit.combo > 1) comboSfx(hit.combo);
    stamp(crit ? t('fx.crit') : move === 'trash' ? t('fx.trashed') : t('fx.archived'), crit ? CYAN : move === 'trash' ? CORAL : WHITE);
    floatText(x, y - 40, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, CYAN, 26);
    // A browser cannot see whether the sender honours it, so the game never says "gone forever".
    if (crit) floatText(x, y + 14, t('fx.unsubSent'), WHITE, 16);
    if (linkOnly) toast(t('toast.linkTab'), 3000);
    await wait(crit ? 700 : 450);
  }
  const t0 = performance.now();
  await apply(hit, src, run, plan);
  if (run !== runId) return;
  r.waited(performance.now() - t0);
  busy = false;
  if (r.phase === 'horde' && r.bossIdx === r.bosses.length && r.hordeIdx === 0) {
    stamp(t('fx.horde'), CORAL);
    music.stop();
  }
  next();
}

/** The on-screen button for a key press sinks, so a keyboard player sees what they hit. */
function pressButton(action: string) {
  const b = controls.querySelector<HTMLElement>(`.btn[data-action="${action}"]`);
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 220);
}

function showHorde() {
  const r = raid!;
  const mail = r.mail!;
  layout('horde');
  armedAt = performance.now() + ARM_CARD_MS;
  screen.innerHTML = `
    ${orbit(`<div class="card-sprite">${monster(mail.fromEmail, 'big', colorFor(mail.fromEmail))}</div>`, `${t('horde.label')} <b>${r.hordeIdx + 1} / ${r.horde.length}</b>`)}
    ${card(mail, r.horde.length - r.hordeIdx - 1)}`;
  controls.innerHTML = `
    <div class="row three">
      ${button('&larr;', t('horde.archive'), 'archive')}
      ${button('&darr;', t('horde.trash'), 'trash', 'danger')}
      ${button('&rarr;', `${t('horde.quest')} &#9733;`, 'star', 'quest')}
    </div>
    ${utilityRow()}`;
  animateMonsters();
  bindSwipe($('.card.live'));
}

function card(m: Mail, behind: number): string {
  // One-off senders are too often people (even with a company address): always hidden in privacy mode.
  const person = true;
  return `
    <section class="panel brief card live" style="--behind:${Math.min(2, behind)}">
      <p class="eyebrow">${t('horde.incoming')} · <time>${ago(m.date)}</time></p>
      <h2 class="sender">${who(m.fromName, person)}</h2>
      <p class="email">${who(m.fromEmail, person)}</p>
      <h3 class="subject">${what(m.subject || t('horde.nosubject'))}</h3>
      ${m.snippet ? `<p class="snippet">${what(m.snippet)}</p>` : ''}
    </section>`;
}

async function hordeMove(move: HordeMove) {
  const r = raid!;
  if (!r.mail) return;
  const src = source;
  const run = runId;
  busy = true;
  pressButton(move);
  const el = $('.card.live');
  const [x, y] = centreOf($('.card-sprite'));
  const comboBefore = r.combo;
  const hit = r.hitMail(move)!;
  updateHud();
  tweenInbox(r.inboxLeft, 250);
  el.classList.add(`fly-${move}`);
  $('.card-sprite').classList.add('dead');
  const color = move === 'trash' ? CORAL : move === 'star' ? BLUE : colorFor(hit.mail!.fromEmail);
  burst(x, y, color, 22 + hit.combo * 4, 6, 6);
  sfx(move === 'trash' ? 'trash' : move === 'star' ? 'coin' : 'hit', 1 + hit.combo * 0.04);
  if (hit.combo > 1) comboSfx(hit.combo);
  shake(3 + hit.combo, 150);
  floatText(x, y - 30, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, CYAN, 18 + hit.combo);
  // Stamped once on the way up, not on every card while the combo stays maxed.
  if ((hit.combo === 5 || hit.combo === 8) && comboBefore < hit.combo) stamp(hit.combo === 8 ? t('fx.combo8') : t('fx.combo5'), CYAN);
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
  layout('clear');
  music.stop();
  fanfare();
  recStopSoon();
  // Leftover stamps and score pops must not cover the result.
  document.querySelectorAll('.stamp, .float-text').forEach((el) => el.remove());
  updateHud();
  // Saved now, so closing the tab keeps it; an undo from here puts the old one back.
  bestBefore = readBest();
  if (r.score > bestBefore) writeBest(r.score);
  renderClear();
  burst(innerWidth / 3, innerHeight / 3, CYAN, 80, 10, 8);
  burst(innerWidth / 3, innerHeight / 3, BLUE, 60, 8, 7);
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
    renderClear();
  } catch (err) {
    console.warn('Could not recount the inbox', err);
  }
}

function renderClear() {
  const r = raid!;
  const cleared = r.stats.archived + r.stats.trashed + r.stats.starred;
  const zero = r.inboxLeft === 0;
  const QUESTS_SHOWN = 4;
  // In privacy mode the link must not show the account address in the status bar.
  const inboxUrl = privacy ? 'https://mail.google.com/mail/u/0/#inbox' : source.inboxUrl;
  const stat = (label: string, value: string, hot = false) => `<div class="${hot ? 'hot' : ''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  screen.innerHTML = `
    ${orbit(`
      <h1 class="result">${zero ? t('clear.zero') : t('clear.stage')}</h1>
      ${r.score > bestBefore ? `<p class="new-best blink">${t('clear.best')}</p>` : ''}
      <p class="before-after"><b>${fmt(r.inboxStart)}</b><span>&rarr;</span><b>${fmt(r.inboxLeft)}</b></p>
      ${!zero && r.outside ? `<p class="outside">${t('clear.outside', { n: fmt(r.outside) })}</p>` : ''}`, '', 'clear-orbit')}
    <section class="panel brief report">
      <p class="eyebrow">${t('clear.report')}</p>
      <dl class="stats">
        ${stat(t('clear.cleared'), fmt(cleared))}
        ${stat(t('clear.bosses'), `${r.stats.bossesDown}/${r.bosses.length}`)}
        ${stat(t('clear.unsubs'), String(r.stats.unsubscribed), r.stats.unsubscribed > 0)}
        ${stat(t('clear.combo'), `x${r.stats.maxCombo}`, r.stats.maxCombo >= 5)}
        ${stat(t('clear.time'), clock(r.elapsedMs))}
        ${stat(t('clear.score'), fmt(r.score), true)}
      </dl>
      ${r.quests.length ? `
        <div class="quests"><p class="hp-label">${t('clear.quests')}</p>
        <ul>${r.quests.slice(0, QUESTS_SHOWN).map((m) => `<li>&#9733; <b>${who(m.fromName, true)}</b> ${what(m.subject)}</li>`).join('')}
        ${r.quests.length > QUESTS_SHOWN ? `<li class="dim">${t('clear.more', { n: r.quests.length - QUESTS_SHOWN })}</li>` : ''}</ul></div>` : ''}
      <p class="proof">${source.isDemo
        ? t('clear.demo')
        : `${t('clear.real')} <a href="${esc(inboxUrl)}" target="_blank" rel="noopener">${t('clear.check')} &rarr;</a>`}</p>
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('C', t('clear.card'), 'card', 'primary')}
      ${button('R', t('clear.again'), 'again')}
      ${button('ESC', t('clear.title'), 'title', 'ghost')}
    </div>
    <div class="mini-row">
      <div class="mini-group">
        ${needsAuth ? `<button class="mini alert" data-action="reauth"><kbd>G</kbd> ${t('reconnect')}</button>` : ''}
        <button class="mini" data-action="undo" ${r.canUndo ? '' : 'disabled'}><kbd>Z</kbd> ${t('undo.last')}</button>
        <button class="mini" data-action="privacy"><kbd>P</kbd> ${privacy ? t('privacy.on') : t('privacy.off')}</button>
      </div>
      ${langSwitch()}
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
          toast(t('toast.unsubAuto'), 3000);
        }
      } catch (err) {
        if (err instanceof AuthExpiredError) throw err;
        console.error(err);
        if (run === runId) raid?.unsubFailed(hit);
        toast(t('toast.unsubFail'), 3000);
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
      toast(t('toast.expired'), 4000);
    } else {
      toast(t('toast.rolledBack'), 3000);
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
    toast(hit.kind === 'unsubscribe' && !source.isDemo ? t('toast.unsubBack') : t('toast.undone'), hit.kind === 'unsubscribe' ? 3500 : 1800);
  } catch (err) {
    console.error(err);
    if (err instanceof AuthExpiredError) needsAuth = true;
    toast(err instanceof AuthExpiredError ? t('toast.expired') : t('toast.undoFail'), 3000);
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
  const step = (tm: number) => {
    const k = Math.min(1, (tm - t0) / ms);
    el.textContent = fmt(from * (1 - k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- input ----------

const MOVES = new Set(['archive', 'unsubscribe', 'trash', 'spare', 'star']);

/** Redraws the current screen (after a language or privacy switch) without a fresh entrance delay. */
function redraw() {
  staticLabels();
  if (view === 'title') return showTitle();
  if (view === 'clear') return renderClear();
  if ((view === 'boss' || view === 'horde') && !busy) {
    const armed = armedAt;
    if (view === 'boss') showBoss(); else showHorde();
    armedAt = armed;
  }
}

function act(action: string) {
  unlockAudio();
  if (action === 'mute') {
    const m = toggleMute();
    toast(m ? t('sound.off') : t('sound.on'));
    if (!m && (view === 'boss' || view === 'horde')) music.start();
    document.querySelectorAll('.mini[data-action="mute"]').forEach((b) => (b.innerHTML = `<kbd>M</kbd> ${m ? t('sound.off') : t('sound.on')}`));
    return;
  }
  if (action === 'lang') {
    setLang(lang === 'en' ? 'pt' : 'en');
    toast(t('toast.lang'));
    return redraw();
  }
  // Esc always gets out, even while Gmail is slow to answer.
  if (action === 'quit' && (view === 'boss' || view === 'horde')) {
    toast(t('toast.stopped'));
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
      if (action === 'quit') { toast(t('toast.scanCancelled')); showTitle(); }
      return;
    case 'boss':
    case 'horde': {
      // Forgot privacy before recording? P works mid-raid and redraws the screen,
      // without giving the boss a fresh entrance delay.
      if (action === 'privacy') { togglePrivacy(); return redraw(); }
      if (action === 'undo') return void undo();
      if (action === 'reauth') return void reconnect();
      if (!MOVES.has(action)) return;
      if (needsAuth) return toast(t('toast.expired'), 3000);
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
        pressButton('card');
        renderShareCard(raid, source.isDemo)
          .then(shareCard)
          .then((how) => { if (how !== 'cancelled') toast(how === 'shared' ? t('toast.shared') : t('toast.saved'), 2500); })
          .catch((err) => { console.error(err); toast(t('toast.cardFail')); })
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
  toast(privacy ? t('toast.privacyOn') : t('toast.privacyOff'));
}

/** Google's consent popup needs a user gesture, so this runs straight from the click or key. */
async function raidGmail() {
  signingIn = true;
  sfx('select');
  toast(t('toast.signin'), 4000);
  try {
    const token = await signIn();
    if (view !== 'title') return;
    const gmail = new GmailSource(token);
    // During the raid a slow Gmail says so, instead of a silent freeze.
    gmail.onWait = (note) => toast(note, 3000);
    startRaid(gmail);
  } catch (err) {
    console.error(err);
    toast(String((err as Error).message).includes('not granted') ? t('toast.notGranted') : t('toast.signinFail'), 3000);
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
    toast(t('toast.reconnected'));
    // Redraw without the RECONNECT button.
    redraw();
  } catch (err) {
    console.error(err);
    toast(t('toast.stillOut'), 3000);
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
  if (k === 'l' && view !== 'scan') return act('lang');
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
