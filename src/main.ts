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
import { bindBoard } from './board';
import { briefingOpen, openBriefing } from './briefing';
import { judgeCall } from './calls';
import { levelFor } from './score';
import { isPerson } from './classifier';
import { makeDial } from './dials';
import { esc, redact } from './html';
import { demoBossTaunt } from './demoInbox';
import { DemoSource } from './demoSource';
import { GmailSource, preloadGoogle, signIn } from './gmailSource';
import { awardBadge, burst, centreOf, flash, floatText, hitStop, initFx, settleParticles, shake, stamp } from './fx';
import { fmt, lang, setLang, t } from './i18n';
import { Raid, splitInbox, type BadgeId, type BossMove, type Hit, type HordeMove } from './raid';
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
const GOLD = '#ffd35c';

function badgeText(id: BadgeId): string {
  return { critical: t('badge.critical'), combo: t('badge.combo'), zero: t('badge.zero'), eagle: t('badge.eagle') }[id];
}

function earnBadge(id: BadgeId) {
  if (!raid?.unlockBadge(id)) return;
  sfx('coin');
  awardBadge(`${t('badge.unlocked')} · ${badgeText(id)}`);
}

// ---------- helpers ----------

// Privacy mode, made for recording: every subject, preview and horde sender is blacked
// out. A boss keeps its name only when it looks like a bulk sender (brands make the video);
// a boss that looks like a person is blacked out too.
let privacy = false;
try { privacy = localStorage.getItem('inbox-raid-privacy') === '1'; } catch { /* storage blocked */ }

// How the horde is played: one card at a time (classic) or the drag and drop triage board.
type PlayStyle = 'classic' | 'board';
let style: PlayStyle = 'board';
try {
  const saved = localStorage.getItem('inbox-raid-style');
  if (saved === 'classic' || saved === 'board') style = saved;
} catch { /* storage blocked */ }

function setStyle(s: PlayStyle) {
  style = s;
  try { localStorage.setItem('inbox-raid-style', s); } catch { /* storage blocked */ }
}

type TutorialStep = 'boss' | 'board' | 'brief' | 'done';
let tutorialStep: TutorialStep = 'done';

function tutorialSeen(): boolean {
  try { return localStorage.getItem('inbox-raid-tutorial-v1') === '1'; } catch { return false; }
}

function finishTutorial() {
  tutorialStep = 'done';
  try { localStorage.setItem('inbox-raid-tutorial-v1', '1'); } catch { /* storage blocked */ }
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
  document.body.dataset.view = v;
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
  // The combo earns the horde its layers: hats, then the lead, then the lead an octave up.
  if (view === 'horde') music.setLevel(levelFor(raid.combo));
}

let lastTick = performance.now();
function hudLoop(tm: number) {
  const dt = Math.min(tm - lastTick, 100);
  lastTick = tm;
  if (raid && (view === 'boss' || view === 'horde')) {
    if (!busy && !needsAuth && raid.tick(dt)) overload();
    // A briefing stops the clock (the time is given back when it closes).
    if (!briefingOpen()) $('#time').textContent = clock(raid.elapsedMs);
    // The needle creeps up while the player hesitates, before stress really counts, and drops on a hit.
    dialStress.update(raid.stress / 100, undefined, undefined, Math.max(raid.stress / 100, raid.hesitation * 0.3));
    const band = Math.floor(raid.stress / 34);
    if (view === 'boss' && band > stressBand && !busy) bossLunge(band);
    stressBand = band;
    // Past a third of the gauge, the song starts to go muffled.
    music.setPressure((raid.stress - 30) / 70);
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

/** Which third of the stress gauge we are in: crossing into the next one makes the boss lunge. */
let stressBand = 0;

/** A hesitating player gets lunged at. Demo bosses also talk back; a real sender never gets invented words. */
function bossLunge(band: number) {
  const sprite = screen.querySelector<HTMLElement>('.boss-sprite');
  if (!sprite) return;
  sprite.classList.remove('lunge');
  void sprite.offsetWidth; // restart the animation
  sprite.classList.add('lunge');
  sfx('boss', 1.15);
  shake(5, 220);
  const bubble = screen.querySelector<HTMLElement>('.boss-taunt');
  if (bubble && source.isDemo) {
    bubble.textContent = t(band >= 2 ? 'boss.press2' : 'boss.press1');
    bubble.classList.remove('again');
    void bubble.offsetWidth;
    bubble.classList.add('again');
  }
}

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
      <div class="styles" role="radiogroup" aria-label="${t('style.label')}">
        <p class="hp-label">${t('style.label')} · <kbd>T</kbd></p>
        ${(['classic', 'board'] as PlayStyle[]).map((s) => `
          <button class="style-opt ${style === s ? 'on' : ''}" role="radio" aria-checked="${style === s}" data-action="style-${s}">
            <i class="style-icon ${s}" aria-hidden="true"></i>
            <b>${t(`style.${s}`)}</b><span>${t(`style.${s}.sub`)}</span>
          </button>`).join('')}
      </div>
      ${best ? `<p class="best">${t('title.best')} <b>${fmt(best)}</b></p>` : ''}
      <p class="fine phone-only">${t('title.fine')}</p>
    </section>`;
  controls.innerHTML = `
    <div class="row four">
      ${button('ENTER', t('title.demo'), 'demo', 'primary')}
      ${button('F', t('title.demoFull'), 'demo-full')}
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

/** Sharp calls as a segment bar: lit for sharp, dim for the rest. */
function callBar(sharp: number, calls: number): string {
  const n = Math.min(calls, 20);
  const on = Math.round((sharp / Math.max(1, calls)) * n);
  return `<div class="segbar calls-bar" style="--n:${n}">${Array.from({ length: n }, (_, i) => (i < on ? '<i></i>' : '<i class="off"></i>')).join('')}</div>`;
}

function segments(n: number, id = ''): string {
  return `<div class="segbar" ${id ? `id="${id}"` : ''} style="--n:${n}">${'<i></i>'.repeat(n)}</div>`;
}

async function startRaid(src: InboxSource) {
  const run = ++runId;
  tutorialStep = src instanceof DemoSource && src.preset === 'blitz' && style === 'board' && !tutorialSeen() ? 'boss' : 'done';
  selectedId = '';
  onBoard.clear();
  document.body.classList.remove('dragging');
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
  raid = new Raid(bosses, horde, outside, style === 'board' ? 4000 : 2500);
  $('.brief.scan').innerHTML = `
    <p class="eyebrow">${src.isDemo ? t('scan.demo') : t('scan.gmail')}</p>
    <p class="scan-count">${fmt(raid.inboxStart)} <small>${t('scan.emails')}</small></p>
    <p class="found">${t('scan.found', { b: bosses.length, h: horde.length })}</p>
    <p class="found plan">${t('scan.plan', { b: bosses.length, n: fmt(bosses.reduce((sum, boss) => sum + boss.mails.length, 0)), h: horde.length })}</p>
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
  // A tense boss theme, a faster horde theme; an undo across phases switches back.
  const section = raid.phase === 'boss' ? 'boss' : 'horde';
  music.setLevel(section === 'boss' ? 1 : levelFor(raid.combo));
  music.start(section);
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
  const taunt = source.isDemo ? demoBossTaunt(boss.email, lang) : '';
  const tag = {
    'one-click': t('boss.tag.oneclick'),
    mailto: t('boss.tag.mailto', { to: who(mailtoAddress(plan.url), person) }),
    link: t('boss.tag.link'),
    none: t('boss.tag.none'),
  }[plan.kind];
  screen.innerHTML = `
    ${orbit(`<div class="boss-sprite">${monster(boss.key, 'big', color)}</div>${taunt ? `<p class="boss-taunt">${esc(taunt)}</p>` : ''}`, `${t('boss.label')} <b>${r.bossIdx + 1} / ${r.bosses.length}</b>`)}
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
      ${tutorialStep === 'boss' && r.bossIdx === 0 ? `<p class="coach-note">${t('tutorial.boss', { n: fmt(hp) })}</p>` : ''}
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
  if (tutorialStep === 'boss' && r.bossIdx === 0) controls.querySelector('[data-action="unsubscribe"]')?.classList.add('coach');
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
  if (tutorialStep === 'boss') tutorialStep = 'board';
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
  const crit = move === 'unsubscribe';
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
    if (crit) await hitStop();
    if (run !== runId) return;
    sprite.classList.add('dead');
    sfx(crit ? 'boom' : move === 'trash' ? 'trash' : 'hit');
    burst(x, y, crit ? BLUE : color, crit ? 72 : 50, crit ? 11 : 8, crit ? 9 : 7);
    burst(x, y, WHITE, crit ? 16 : 20, 5, 4);
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
  const applied = await apply(hit, src, run, plan);
  if (run !== runId) return;
  r.waited(performance.now() - t0);
  if (applied && crit && boss.status === 'unsubscribed') earnBadge('critical');
  busy = false;
  if (r.phase === 'horde' && r.bossIdx === r.bosses.length && r.hordeIdx === 0) {
    settleParticles();
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
  if (style === 'board') return showBoard();
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
  const hit = r.hitMail(move, undefined, judgeCall(r.mail!, move))!;
  el.classList.add(`fly-${move}`);
  $('.card-sprite').classList.add('dead');
  await landHit(hit, comboBefore, x, y, src, run);
}

/** Effects of a horde hit, then the real action in the inbox. Shared by both play styles. */
async function landHit(hit: Hit, comboBefore: number, x: number, y: number, src: InboxSource, run: number) {
  const r = raid!;
  const move = hit.kind;
  updateHud();
  tweenInbox(r.inboxLeft, 250);
  const color = move === 'trash' ? CORAL : move === 'star' ? BLUE : colorFor(hit.mail!.fromEmail);
  burst(x, y, color, 22 + hit.combo * 4, 6, 6);
  sfx(move === 'trash' ? 'trash' : move === 'star' ? 'coin' : 'hit', 1 + hit.combo * 0.04);
  if (hit.combo > 1) comboSfx(hit.combo);
  shake(3 + hit.combo, 150);
  floatText(x, y - 30, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, CYAN, 18 + hit.combo);
  // The call is judged out loud, but a missed one costs nothing: the report lists it instead.
  if (hit.verdict === 'sharp') floatText(x, y + 24, t('fx.sharp'), GOLD, 16);
  else if (hit.verdict === 'missed') floatText(x, y + 24, t('fx.check'), CORAL, 15);
  // Stamped once on the way up, not on every card while the combo stays maxed.
  if ((hit.combo === 5 || hit.combo === 8) && comboBefore < hit.combo) stamp(hit.combo === 8 ? t('fx.combo8') : t('fx.combo5'), CYAN);
  await wait(170);
  const t0 = performance.now();
  const applied = await apply(hit, src, run);
  if (run !== runId) return;
  r.waited(performance.now() - t0);
  if (applied && hit.combo === 8) earnBadge('combo');
  busy = false;
  next();
}

// ---------- triage board ----------

/** Points for a reply draft saved from a briefing. */
const DRAFT_POINTS = 300;
/** The card the keyboard (and a tap on a zone) acts on. */
let selectedId = '';
/** Cards already on the board, so only new arrivals slide in. */
let onBoard = new Set<string>();

function queueShown(): number {
  if (matchMedia('(max-width: 700px)').matches) return 3;
  if (matchMedia('(max-height: 760px)').matches) return 4;
  return 5;
}

function showBoard() {
  const r = raid!;
  layout('horde');
  arena.classList.add('board');
  armedAt = performance.now() + ARM_CARD_MS;
  const left = r.horde.slice(r.hordeIdx);
  const shown = left.slice(0, queueShown());
  if (!shown.some((m) => m.id === selectedId)) selectedId = shown[0]?.id ?? '';
  const zone = (id: string, key: string, label: string, sub: string, count: number) => `
    <button class="zone z-${id}" data-zone="${id}" data-action="${id === 'act' ? 'star' : id}">
      <i class="zone-mouth" aria-hidden="true"></i>
      <span class="zone-top"><kbd>${key}</kbd><b>${label}</b><em>${fmt(count)}</em></span>
      <span class="zone-sub">${sub}</span>
    </button>`;
  screen.innerHTML = `
    <section class="panel orbit queue">
      <p class="orbit-tag">${t('board.queue')} <b>${r.hordeIdx + 1} / ${r.horde.length}</b></p>
      <ol class="queue-list" role="listbox" aria-label="${t('board.queue')}">${shown.map((m) => miniCard(m, !onBoard.has(m.id))).join('')}</ol>
      ${left.length > shown.length ? `<p class="queue-more">${t('board.more', { n: left.length - shown.length })}</p>` : ''}
    </section>
    <section class="panel brief zones">
      ${zone('archive', '&larr;', t('board.archive'), t('board.archive.sub'), r.stats.archived)}
      ${zone('trash', '&darr;', t('board.trash'), t('board.trash.sub'), r.stats.trashed)}
      ${zone('act', '&rarr;', `${t('board.act')} &#9733;`, t('board.act.sub'), r.stats.starred)}
      <p class="fine board-hint">${tutorialStep === 'board' ? t('tutorial.board') : t('board.hint')}</p>
    </section>`;
  onBoard = new Set(shown.map((m) => m.id));
  controls.innerHTML = utilityRow();
  animateMonsters();
  if (tutorialStep === 'board') {
    screen.querySelector(`.mini-card[data-id="${CSS.escape(selectedId)}"]`)?.classList.add('coach-card');
    screen.querySelector('[data-zone="act"]')?.classList.add('coach');
  }
  bindBoard($('.queue-list'), [...screen.querySelectorAll<HTMLElement>('[data-zone]')], {
    canDrag: () => !busy && !needsAuth && performance.now() >= armedAt,
    tap: (card) => selectCard(card.dataset.id!),
    drop: (zoneId, card) => boardAct(zoneId === 'act' ? 'star' : zoneId as HordeMove, card.dataset.id!, true),
  });
}

function miniCard(m: Mail, fresh: boolean): string {
  return `
    <li class="mini-card ${m.id === selectedId ? 'sel' : ''} ${fresh ? 'enter' : ''}" data-id="${esc(m.id)}" role="option" aria-selected="${m.id === selectedId}" tabindex="-1">
      ${monster(m.fromEmail, 'mini', colorFor(m.fromEmail))}
      <span class="mc-text"><b>${who(m.fromName, true)}</b><span>${what(m.subject || t('horde.nosubject'))}</span></span>
      <time>${ago(m.date)}</time>
    </li>`;
}

function selectCard(id: string) {
  selectedId = id;
  screen.querySelectorAll<HTMLElement>('.mini-card').forEach((c) => {
    const selected = c.dataset.id === id;
    c.classList.toggle('sel', selected);
    c.setAttribute('aria-selected', String(selected));
  });
  sfx('tick');
}

/** ↑ walks the selection down the queue and wraps around. */
function selectNext() {
  const ids = [...screen.querySelectorAll<HTMLElement>('.mini-card')].map((c) => c.dataset.id!);
  if (ids.length) selectCard(ids[(ids.indexOf(selectedId) + 1) % ids.length]);
}

/** A card goes to a zone. ACT (star) first opens the briefing, which decides its fate. */
async function boardAct(move: HordeMove, id: string, dragged = false) {
  const r = raid!;
  if (!r.horde.slice(r.hordeIdx).some((m) => m.id === id)) return;
  if (tutorialStep === 'board') {
    if (move === 'star') tutorialStep = 'brief';
    else finishTutorial();
  }
  if (move === 'star') return openAct(id, dragged);
  boardMove(move, id, dragged);
}

async function boardMove(move: HordeMove, id: string, dragged: boolean) {
  const r = raid!;
  const src = source;
  const run = runId;
  busy = true;
  pressZone(move);
  const zoneEl = $(`[data-zone="${move === 'star' ? 'act' : move}"]`);
  if (!dragged) screen.querySelector(`.mini-card[data-id="${CSS.escape(id)}"]`)?.classList.add(`zap-${move}`);
  else screen.querySelector(`.mini-card[data-id="${CSS.escape(id)}"]`)?.classList.add('gone');
  const comboBefore = r.combo;
  const target = r.horde.find((m) => m.id === id);
  const hit = r.hitMail(move, id, target && judgeCall(target, move));
  if (!hit) { busy = false; return; }
  const [x, y] = centreOf(zoneEl);
  await landHit(hit, comboBefore, x, y, src, run);
}

function pressZone(move: HordeMove) {
  const z = screen.querySelector<HTMLElement>(`[data-zone="${move === 'star' ? 'act' : move}"]`);
  if (!z) return;
  z.classList.add('gulp');
  setTimeout(() => z.classList.remove('gulp'), 360);
}

/** ACT: the clock stops, the briefing opens, and the player picks what happens. */
async function openAct(id: string, dragged: boolean) {
  const r = raid!;
  const mail = r.horde.slice(r.hordeIdx).find((m) => m.id === id);
  if (!mail) return;
  const run = runId;
  busy = true;
  const t0 = performance.now();
  const coached = tutorialStep === 'brief';
  const res = await openBriefing({ mail, source, person: isPerson(mail), privacy, inRaid: true, coach: coached, drafted: r.hasDraft(mail.id), toast });
  if (run !== runId || raid !== r) return;
  r.paused(performance.now() - t0);
  busy = false;
  if (coached) {
    if (res.move) finishTutorial();
    else tutorialStep = 'board';
  }
  if (res.authExpired) {
    needsAuth = true;
    toast(t('toast.expired'), 4000);
    return showBoard();
  }
  if (!res.move) return showBoard();
  if (res.drafted) {
    // Before the hit, so undoing the hit keeps the points: the draft stays in Gmail.
    if (r.rewardDraft(id, DRAFT_POINTS)) stamp(t('fx.mission'), CYAN);
  }
  boardMove(res.move, id, dragged && res.move === 'star');
}

/** After the raid: a quest from the log opens its briefing, only to write a draft. */
async function briefQuest(id: string) {
  const r = raid!;
  const mail = r.quests.find((m) => m.id === id);
  if (!mail || busy) return;
  const run = runId;
  busy = true;
  const res = await openBriefing({ mail, source, person: isPerson(mail), privacy, inRaid: false, drafted: r.hasDraft(mail.id), toast });
  if (run !== runId || raid !== r) return;
  busy = false;
  if (res.authExpired) { needsAuth = true; toast(t('toast.expired'), 4000); }
  if (res.drafted) {
    if (r.rewardDraft(id, DRAFT_POINTS)) {
      if (r.score > readBest()) writeBest(r.score);
      sfx('coin');
      stamp(t('fx.mission'), CYAN);
      updateHud();
    }
  }
  renderClear();
}

function showClear() {
  const r = raid!;
  layout('clear');
  music.stop();
  if (source.isDemo && r.inboxLeft === 0) earnBadge('zero');
  if (r.eagleEye) earnBadge('eagle');
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
    if (run !== runId || view !== 'clear' || raid !== r) return;
    if (real !== r.inboxLeft) {
      r.inboxLeft = real;
      shownInbox = real;
    }
    if (real === 0) earnBadge('zero');
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
      ${r.shownBadges.length ? `<div class="badges"><p class="hp-label">${t('clear.badges')}</p><ul>${r.shownBadges.map((id) => `<li>★ ${badgeText(id)}</li>`).join('')}</ul></div>` : ''}
      ${r.stats.calls ? `
        <div class="calls"><p class="hp-label">${t('clear.calls')} · <b>${r.stats.sharp}/${r.stats.calls}</b> <span>${t('clear.callsSub')}</span></p>
        ${callBar(r.stats.sharp, r.stats.calls)}</div>` : ''}
      ${r.missed.length ? `
        <div class="missed"><p class="hp-label">${t('clear.missed')}</p>
        <ul>${r.missed.slice(0, 3).map((m) => `<li>&#9873; <b>${who(m.fromName, true)}</b> ${what(m.subject)}</li>`).join('')}
        ${r.missed.length > 3 ? `<li class="dim">${t('clear.more', { n: r.missed.length - 3 })}</li>` : ''}</ul>
        <p class="drafts dim">${t('clear.missedSub')}</p></div>` : ''}
      ${r.quests.length ? `
        <div class="quests"><p class="hp-label">${t('clear.quests')}</p>
        ${r.stats.drafts ? `<p class="drafts">&#10022; ${source.isDemo ? t('clear.draftsDemo', { n: r.stats.drafts }) : t('clear.drafts', { n: r.stats.drafts })}</p>` : ''}
        <ul>${r.quests.slice(0, QUESTS_SHOWN).map((m) => `<li><button class="quest-item ${r.hasDraft(m.id) ? 'drafted' : ''}" data-brief-id="${esc(m.id)}" title="${r.hasDraft(m.id) ? t('brief.draftSaved') : t('clear.openBrief')}">${r.hasDraft(m.id) ? '&#10003;' : '&#9733;'} <b>${who(m.fromName, true)}</b> ${what(m.subject)}</button></li>`).join('')}
        ${r.quests.length > QUESTS_SHOWN ? `<li class="dim">${t('clear.more', { n: r.quests.length - QUESTS_SHOWN })}</li>` : ''}</ul>
        <p class="drafts dim">&#9656; ${t('clear.openBrief')}</p></div>` : ''}
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
async function apply(hit: Hit, src: InboxSource, run: number, plan?: UnsubPlan): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error(err);
    if (run !== runId) return false;
    raid?.undo();
    tweenInbox(raid?.inboxLeft ?? 0, 300);
    updateHud();
    if (err instanceof AuthExpiredError) {
      needsAuth = true;
      toast(t('toast.expired'), 4000);
    } else {
      toast(t('toast.rolledBack'), 3000);
    }
    return false;
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
  if ((view === 'boss' || view === 'horde') && !busy && !briefingOpen()) {
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
      if (action === 'demo') { sfx('select'); startRaid(new DemoSource('blitz')); }
      if (action === 'demo-full') { sfx('select'); startRaid(new DemoSource('full')); }
      if (action === 'gmail' && !signingIn) raidGmail();
      if (action === 'privacy') { togglePrivacy(); showTitle(); }
      if (action.startsWith('style')) {
        const s: PlayStyle = action === 'style-board' ? 'board' : action === 'style-classic' ? 'classic' : style === 'board' ? 'classic' : 'board';
        setStyle(s);
        sfx('select');
        showTitle();
      }
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
      if (action === 'next') return void (view === 'horde' && style === 'board' && selectNext());
      if (!MOVES.has(action)) return;
      if (needsAuth) return toast(t('toast.expired'), 3000);
      if (performance.now() < armedAt) return;
      if (view === 'boss') bossMove(action as BossMove);
      else if (style === 'board') boardAct(action as HordeMove, selectedId);
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
      if (action === 'again') startRaid(source instanceof DemoSource ? new DemoSource(source.preset) : source);
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
  title: { Enter: 'demo', ' ': 'demo', f: 'demo-full', g: 'gmail', p: 'privacy', t: 'style' },
  boss: { a: 'archive', u: 'unsubscribe', d: 'trash', s: 'spare', ArrowLeft: 'archive', ArrowDown: 'trash', Escape: 'quit', g: 'reauth', p: 'privacy' },
  horde: { ArrowLeft: 'archive', a: 'archive', ArrowDown: 'trash', d: 'trash', ArrowRight: 'star', ArrowUp: 'next', Escape: 'quit', g: 'reauth', p: 'privacy' },
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

// Buttons inside the screen: the style picker, the board zones (a tap sends the selected
// card) and the quest log on the final screen.
screen.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
  const quest = el.closest<HTMLElement>('[data-brief-id]');
  if (quest && view === 'clear') { unlockAudio(); return void briefQuest(quest.dataset.briefId!); }
  const btn = el.closest<HTMLButtonElement>('button[data-action]');
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
