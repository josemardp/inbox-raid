import './style.css';
import { comboSfx, drainSfx, fanfare, isMuted, music, sfx, toggleMute, unlockAudio } from './audio';
import { DemoSource } from './demoSource';
import { burst, centreOf, flash, floatText, initFx, shake, stamp } from './fx';
import { Raid, splitInbox, type BossMove, type Hit, type HordeMove } from './raid';
import { colorFor, drawMonster, PALETTE } from './sprites';
import type { InboxSource, Mail } from './types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const screen = $('#screen');
const controls = $('#controls');
const hud = $('#hud');
initFx($<HTMLCanvasElement>('#fx'), $('#stage'));

let source: InboxSource = new DemoSource();
let raid: Raid | null = null;
let busy = false;
/** Last key pressed during an animation; it runs as soon as the animation ends. */
let queued: string | null = null;
let view: 'title' | 'scan' | 'boss' | 'horde' | 'clear' = 'title';
let monsterTimer = 0;

// ---------- helpers ----------

/** Mail data can come from a real inbox: always escape before innerHTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ago(date: number): string {
  const d = Math.floor((Date.now() - date) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

let toastTimer = 0;
function toast(text: string) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1600);
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
  combo.textContent = raid.combo > 1 ? `COMBO x${raid.combo}` : '';
  combo.dataset.level = String(Math.min(raid.combo, 8));
}

let lastTick = performance.now();
function hudLoop(t: number) {
  const dt = t - lastTick;
  lastTick = t;
  if (raid && (view === 'boss' || view === 'horde')) {
    if (!busy && raid.tick(dt)) overload();
    $('#time').textContent = clock(raid.elapsedMs);
    const fill = $('#stress-fill');
    fill.style.width = `${raid.stress}%`;
    fill.classList.toggle('hot', raid.stress > 70);
  }
  requestAnimationFrame(hudLoop);
}
requestAnimationFrame(hudLoop);

function overload() {
  sfx('overload');
  flash('#ff3b3b');
  shake(14, 400);
  stamp('OVERWHELMED!', '#ff3b3b');
  updateHud();
}

// ---------- screens ----------

function showTitle() {
  view = 'title';
  raid = null;
  music.stop();
  hud.hidden = true;
  const parade = PALETTE.map((c, i) => `<canvas class="monster parade" data-key="parade-${i}" data-w="11" data-h="9" data-color="${c}" style="animation-delay:${i * -0.4}s"></canvas>`).join('');
  let best = 0;
  try { best = Number(localStorage.getItem('inbox-raid-best') || 0); } catch { /* storage blocked */ }
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
      ${button('G', 'RAID MY GMAIL', 'gmail', '', true)}
    </div>
    <p class="fine">Demo uses a fake inbox. Gmail mode lands Tuesday. 100% in your browser, no server.</p>`;
  animateMonsters();
}

async function startRaid(src: InboxSource) {
  source = src;
  view = 'scan';
  hud.hidden = true;
  screen.innerHTML = `
    <section class="scan">
      <p class="blink">SCANNING ${esc(src.label)}...</p>
      <p class="scan-count"><span id="scan-n">0</span> emails</p>
      <div class="scan-bar"><i id="scan-fill"></i></div>
    </section>`;
  controls.innerHTML = '';
  const mails = await src.load((n) => {
    $('#scan-n').textContent = fmt(n);
    $('#scan-fill').style.width = `${Math.min(100, (n / 420) * 100)}%`;
    sfx('tick', 1 + (n % 50) / 50);
  });
  $('#scan-fill').style.width = '100%';
  const { bosses, horde } = splitInbox(mails);
  raid = new Raid(bosses, horde);
  screen.innerHTML = `
    <section class="scan">
      <p class="scan-count">${fmt(mails.length)} emails</p>
      <p class="found"><b>${bosses.length}</b> BOSSES &middot; <b>${horde.length}</b> IN THE HORDE</p>
      <p class="blink ready">READY?</p>
    </section>`;
  shownInbox = raid.inboxStart;
  $('#inbox-count').textContent = fmt(shownInbox);
  await new Promise((r) => setTimeout(r, 1400));
  hud.hidden = false;
  raid.startedAt = performance.now();
  updateHud();
  music.start(132);
  stamp('FIGHT!', '#ffd23f');
  sfx('boom');
  next();
}

/** Routes to whatever the raid needs next, then runs a key the player pressed meanwhile. */
function next() {
  if (!raid) return;
  if (raid.phase === 'boss') showBoss();
  else if (raid.phase === 'horde') showHorde();
  else { queued = null; showClear(); return; }
  const q = queued;
  queued = null;
  if (q) act(q);
}

function showBoss() {
  const r = raid!;
  const boss = r.boss!;
  view = 'boss';
  const color = colorFor(boss.key);
  const hp = boss.mails.length;
  const samples = [...new Set(boss.mails.map((m) => m.subject))].slice(0, 3);
  const canUnsub = boss.mails.some((m) => m.listUnsubscribe);
  screen.innerHTML = `
    <section class="boss" style="--c:${color}">
      <p class="label">BOSS ${r.bossIdx + 1} / ${r.bosses.length}</p>
      <div class="boss-sprite">${monster(boss.key, 11, 9, 'big')}</div>
      <h2 class="boss-name">${esc(boss.name)}</h2>
      <p class="boss-email">${esc(boss.email)}</p>
      <div class="hp"><span>HP</span><div class="hp-bar"><i id="hp-fill"></i></div><b id="hp-n">${fmt(hp)}</b></div>
      <ul class="attacks">${samples.map((s) => `<li>&gt; ${esc(s)}</li>`).join('')}</ul>
      ${canUnsub ? '<p class="tag">UNSUBSCRIBE AVAILABLE: CRITICAL HIT</p>' : '<p class="tag dim">No unsubscribe link from this sender</p>'}
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('A', 'ARCHIVE ALL', 'archive')}
      ${button('U', 'UNSUBSCRIBE', 'unsubscribe', 'crit', !canUnsub)}
      ${button('D', 'TRASH ALL', 'trash', 'danger')}
      ${button('S', 'SPARE', 'spare', 'ghost')}
    </div>
    ${undoHint()}`;
  animateMonsters();
  sfx('boss');
}

async function bossMove(move: BossMove) {
  const r = raid!;
  const boss = r.boss;
  if (!boss || busy) return;
  if (move === 'unsubscribe' && !boss.mails.some((m) => m.listUnsubscribe)) return;
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
    const drainMs = Math.min(900, 300 + n * 4);
    drainSfx(n, drainMs);
    $('#hp-fill').style.transition = `width ${drainMs}ms linear`;
    $('#hp-fill').style.width = '0%';
    countDown($('#hp-n'), n, drainMs);
    tweenInbox(r.inboxLeft, drainMs);
    await wait(drainMs);
    sprite.classList.add('dead');
    const crit = move === 'unsubscribe';
    sfx(crit ? 'boom' : move === 'trash' ? 'trash' : 'hit');
    burst(x, y, color, crit ? 90 : 50, crit ? 11 : 8, crit ? 9 : 7);
    burst(x, y, '#ffffff', 20, 5, 4);
    shake(crit ? 18 : 10, crit ? 500 : 300);
    if (crit) flash(color);
    if (hit.combo > 1) comboSfx(hit.combo);
    stamp(crit ? 'UNSUBSCRIBED!' : move === 'trash' ? 'TRASHED!' : 'ARCHIVED!', crit ? '#ffd23f' : color);
    floatText(x, y - 40, `+${fmt(hit.points)}${hit.combo > 1 ? ` x${hit.combo}` : ''}`, '#ffd23f', 22);
    if (crit) floatText(x, y + 10, 'GONE FOREVER', '#fff', 14);
    await wait(crit ? 900 : 650);
  }
  await apply(hit);
  busy = false;
  if (r.phase === 'horde' && hit.boss && r.bossIdx === r.bosses.length) {
    stamp('HORDE INCOMING!', '#ff2e88');
    music.stop();
    music.start(152);
  }
  next();
}

function showHorde() {
  const r = raid!;
  const mail = r.mail!;
  view = 'horde';
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
    <div class="row">
      ${button('&larr;', 'ARCHIVE', 'archive')}
      ${button('&darr;', 'TRASH', 'trash', 'danger')}
      ${button('&rarr;', 'QUEST &#9733;', 'star', 'crit')}
    </div>
    ${undoHint()}`;
  animateMonsters();
  bindSwipe($('.card.live'));
}

function card(m: Mail): string {
  const c = colorFor(m.fromEmail);
  return `
    <article class="card live" style="--c:${c}">
      <header>${monster(m.fromEmail, 11, 9, 'small')}<div><b>${esc(m.fromName)}</b><small>${esc(m.fromEmail)}</small></div><time>${ago(m.date)}</time></header>
      <h3>${esc(m.subject || '(no subject)')}</h3>
      ${m.snippet ? `<p>${esc(m.snippet)}</p>` : ''}
    </article>`;
}

async function hordeMove(move: HordeMove) {
  const r = raid!;
  if (!r.mail || busy) return;
  busy = true;
  const el = $('.card.live');
  const [x, y] = centreOf(el);
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
  if (hit.combo === 5 || hit.combo === 8) stamp(hit.combo === 8 ? 'MAX COMBO!' : 'COMBO x5!', '#3cff7a');
  await wait(170);
  await apply(hit);
  busy = false;
  next();
}

async function showClear() {
  const r = raid!;
  view = 'clear';
  music.stop();
  fanfare();
  hud.hidden = false;
  updateHud();
  let best = 0;
  try {
    best = Number(localStorage.getItem('inbox-raid-best') || 0);
    if (r.score > best) localStorage.setItem('inbox-raid-best', String(r.score));
  } catch { /* storage blocked */ }
  const cleared = r.stats.archived + r.stats.trashed + r.stats.starred;
  const zero = r.inboxLeft === 0;
  $('#combo').textContent = '';
  screen.innerHTML = `
    <section class="clear">
      <h1 class="logo small"><span>${zero ? 'INBOX ZERO' : 'STAGE CLEAR'}</span></h1>
      ${r.score > best ? '<p class="best blink">NEW HIGH SCORE!</p>' : ''}
      <p class="before-after"><b>${fmt(r.inboxStart)}</b> <span>&rarr;</span> <b>${fmt(r.inboxLeft)}</b></p>
      <dl class="stats">
        <div><dt>EMAILS CLEARED</dt><dd>${fmt(cleared)}</dd></div>
        <div><dt>BOSSES DOWN</dt><dd>${r.stats.bossesDown}/${r.bosses.length}</dd></div>
        <div><dt>UNSUBSCRIBED</dt><dd>${r.stats.unsubscribed}</dd></div>
        <div><dt>MAX COMBO</dt><dd>x${r.stats.maxCombo}</dd></div>
        <div><dt>TIME</dt><dd>${clock(r.elapsedMs)}</dd></div>
        <div><dt>SCORE</dt><dd>${fmt(r.score)}</dd></div>
      </dl>
      ${r.quests.length ? `
        <div class="quests"><p class="label">QUEST LOG &middot; starred, waiting for you in Starred</p>
        <ul>${r.quests.map((m) => `<li>&#9733; <b>${esc(m.fromName)}</b> ${esc(m.subject)}</li>`).join('')}</ul></div>` : ''}
      <p class="proof">${source.isDemo
        ? 'Demo mode: nothing real was touched. Imagine this was your inbox.'
        : 'This was your real inbox. Go check it.'}</p>
    </section>`;
  controls.innerHTML = `
    <div class="row">
      ${button('R', 'PLAY AGAIN', 'again', 'primary')}
      ${button('ESC', 'TITLE', 'title', 'ghost')}
    </div>`;
  burst(innerWidth / 2, innerHeight / 3, '#ffd23f', 80, 10, 8);
  burst(innerWidth / 2, innerHeight / 3, '#ff2e88', 60, 8, 7);
}

function undoHint() {
  return `<p class="fine">${raid?.canUndo ? '<kbd>Z</kbd> undo &middot; ' : ''}<kbd>M</kbd> ${isMuted() ? 'unmute' : 'mute'}</p>`;
}

// ---------- applying to the inbox ----------

/** Applies a hit to the real source. On failure the game rolls back. */
async function apply(hit: Hit) {
  try {
    if (hit.kind === 'archive') await source.archive(hit.ids);
    else if (hit.kind === 'trash') await source.trash(hit.ids);
    else if (hit.kind === 'star') await source.star(hit.ids);
    else if (hit.kind === 'unsubscribe' && hit.boss) {
      const res = await source.unsubscribe(hit.boss.mails[0]);
      if (!res.ok) toast('Unsubscribe link opened in a new tab');
      await source.archive(hit.ids);
    }
  } catch (err) {
    console.error(err);
    raid?.undo();
    updateHud();
    toast('Inbox did not accept that. Rolled back.');
  }
}

async function undo() {
  if (!raid || busy || !raid.canUndo) return;
  busy = true;
  const hit = raid.undo()!;
  try {
    if (hit.kind !== 'spare') await source.undo(hit.kind, hit.ids);
  } catch (err) {
    console.error(err);
  }
  sfx('undo');
  toast('UNDONE');
  tweenInbox(raid.inboxLeft, 300);
  updateHud();
  busy = false;
  next();
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- input ----------

function act(action: string) {
  unlockAudio();
  if (busy && (view === 'boss' || view === 'horde') && action !== 'mute') {
    queued = action;
    return;
  }
  switch (view) {
    case 'title':
      if (action === 'demo') { sfx('select'); startRaid(new DemoSource()); }
      break;
    case 'boss':
      if (['archive', 'unsubscribe', 'trash', 'spare'].includes(action)) bossMove(action as BossMove);
      break;
    case 'horde':
      if (['archive', 'trash', 'star'].includes(action)) hordeMove(action as HordeMove);
      break;
    case 'clear':
      if (action === 'again') startRaid(source.isDemo ? new DemoSource() : source);
      if (action === 'title') showTitle();
      break;
  }
  if (action === 'undo') undo();
  if (action === 'mute') {
    const m = toggleMute();
    toast(m ? 'SOUND OFF' : 'SOUND ON');
    if (!m && (view === 'boss' || view === 'horde')) music.start();
  }
}

const KEYS: Record<string, Record<string, string>> = {
  title: { Enter: 'demo', ' ': 'demo' },
  boss: { a: 'archive', u: 'unsubscribe', d: 'trash', s: 'spare', ArrowLeft: 'archive', ArrowDown: 'trash' },
  horde: { ArrowLeft: 'archive', a: 'archive', ArrowDown: 'trash', d: 'trash', ArrowRight: 'star', s: 'star' },
  clear: { r: 'again', Enter: 'again', Escape: 'title' },
};

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); act('undo'); }
    return;
  }
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

/** Phone controls: swipe the card left (archive), down (trash) or right (quest). */
function bindSwipe(el: HTMLElement) {
  let x0 = 0, y0 = 0, active = false;
  el.addEventListener('pointerdown', (e) => { active = true; x0 = e.clientX; y0 = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    el.style.transform = `translate(${e.clientX - x0}px, ${Math.max(0, e.clientY - y0)}px) rotate(${(e.clientX - x0) / 20}deg)`;
  });
  el.addEventListener('pointerup', (e) => {
    if (!active) return;
    active = false;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    el.style.transform = '';
    if (Math.abs(dx) > 70 && Math.abs(dx) > dy) act(dx < 0 ? 'archive' : 'star');
    else if (dy > 70) act('trash');
  });
}

showTitle();
