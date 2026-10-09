import type { Verdict } from './calls';
import type { ActionKind, Mail } from './types';

export type BossStatus = 'alive' | 'archived' | 'trashed' | 'unsubscribed' | 'spared';

export interface Boss {
  key: string;
  name: string;
  email: string;
  mails: Mail[];
  status: BossStatus;
}

export type Phase = 'boss' | 'horde' | 'done';
export type BossMove = 'archive' | 'trash' | 'unsubscribe' | 'spare';
export type HordeMove = 'archive' | 'trash' | 'star';
export type BadgeId = 'critical' | 'combo' | 'zero' | 'eagle';

export interface Stats {
  archived: number;
  trashed: number;
  starred: number;
  unsubscribed: number;
  bossesDown: number;
  spared: number;
  maxCombo: number;
  /** Reply drafts written from a quest briefing (never sent by the game). */
  drafts: number;
  /** Horde calls made, and how many matched the safe recommendation. */
  calls: number;
  sharp: number;
}

/** What one hit did, so the UI can animate it and the source can apply it. */
export interface Hit {
  kind: ActionKind | 'spare';
  ids: string[];
  points: number;
  combo: number;
  boss?: Boss;
  mail?: Mail;
  /** Horde only: how the call compares with the safe recommendation. */
  verdict?: Verdict;
}

const COMBO_WINDOW_MS = 2500;
const MAX_COMBO = 8;
/** A call that matches the safe recommendation earns this on top, times the combo. */
export const SHARP_BONUS = 50;
/** Enough horde calls, none missed: the Eagle Eye medal. */
export const EAGLE_MIN_CALLS = 5;
export const MIN_BOSS_EMAILS = 3;
const MAX_BOSSES = 20;
/** A real inbox can hold thousands of one-off emails; one raid takes the newest ones. */
const MAX_HORDE = 60;

/**
 * Senders with MIN_BOSS_EMAILS+ emails become bosses (biggest first); the rest is the horde.
 * `overflow` counts horde emails left for the next raid.
 */
export function splitInbox(mails: Mail[]): { bosses: Boss[]; horde: Mail[]; overflow: number } {
  const groups = new Map<string, Mail[]>();
  for (const m of mails) {
    const key = m.fromEmail.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(m); else groups.set(key, [m]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const bosses: Boss[] = [];
  const horde: Mail[] = [];
  for (const [key, list] of sorted) {
    if (list.length >= MIN_BOSS_EMAILS && bosses.length < MAX_BOSSES) {
      bosses.push({ key, name: list[0].fromName || key, email: key, mails: list, status: 'alive' });
    } else {
      horde.push(...list);
    }
  }
  horde.sort((a, b) => b.date - a.date);
  return { bosses, horde: horde.slice(0, MAX_HORDE), overflow: Math.max(0, horde.length - MAX_HORDE) };
}

interface Snapshot {
  phase: Phase;
  bossIdx: number;
  hordeIdx: number;
  inboxLeft: number;
  score: number;
  combo: number;
  stress: number;
  stats: Stats;
  quests: number;
  missed: number;
  bossStatus: BossStatus | null;
  lastActionAt: number;
  /** Exact queue order before the hit, including an out-of-order board pick. */
  horde: Mail[];
  hit: Hit;
}

export class Raid {
  phase: Phase;
  bossIdx = 0;
  hordeIdx = 0;
  inboxLeft: number;
  readonly inboxStart: number;
  score = 0;
  combo = 1;
  /** 0..100. Fills while you hesitate, drains when you act. */
  stress = 0;
  quests: Mail[] = [];
  /** Emails that looked like they needed the player but were archived or trashed. */
  missed: Mail[] = [];
  readonly badges = new Set<BadgeId>();
  private draftedIds = new Set<string>();
  stats: Stats = { archived: 0, trashed: 0, starred: 0, unsubscribed: 0, bossesDown: 0, spared: 0, maxCombo: 1, drafts: 0, calls: 0, sharp: 0 };
  startedAt = performance.now();
  endedAt = 0;
  private lastActionAt = 0;
  private idleSince = performance.now();
  private history: Snapshot[] = [];

  /**
   * `outside` = emails still in the inbox that this raid does not fight (not scanned, or
   * past the horde limit). They count in the inbox total, so INBOX ZERO is never a lie.
   */
  constructor(
    readonly bosses: Boss[],
    readonly horde: Mail[],
    readonly outside = 0,
    private readonly hordeComboWindowMs = COMBO_WINDOW_MS,
  ) {
    this.inboxStart = this.inboxLeft = bosses.reduce((s, b) => s + b.mails.length, 0) + horde.length + outside;
    this.phase = bosses.length ? 'boss' : horde.length ? 'horde' : 'done';
  }

  get boss(): Boss | undefined { return this.bosses[this.bossIdx]; }
  get mail(): Mail | undefined { return this.horde[this.hordeIdx]; }
  get elapsedMs(): number { return (this.endedAt || performance.now()) - this.startedAt; }
  get canUndo(): boolean { return this.history.length > 0; }

  /** The hit that undo() would roll back, so the inbox can be fixed first. */
  peekUndo(): Hit | null { return this.history.at(-1)?.hit ?? null; }

  /** Hesitation does not count while the tab is hidden. */
  resetIdle() { this.idleSince = performance.now(); }

  /** Time spent waiting for Gmail is not the player's: it costs no combo and no stress. */
  waited(ms: number) {
    this.lastActionAt += ms;
    this.idleSince += ms;
  }

  /** The unsubscribe did not go out: that boss counts as archived, not unsubscribed. */
  unsubFailed(hit: Hit) {
    if (hit.kind !== 'unsubscribe' || hit.boss?.status !== 'unsubscribed') return;
    hit.boss.status = 'archived';
    this.stats.unsubscribed = Math.max(0, this.stats.unsubscribed - 1);
  }

  hitBoss(move: BossMove): Hit | null {
    const boss = this.boss;
    if (this.phase !== 'boss' || !boss) return null;
    const ids = boss.mails.map((m) => m.id);
    const snap = this.snapshot(boss.status);
    let hit: Hit;
    if (move === 'spare') {
      boss.status = 'spared';
      this.stats.spared++;
      hit = { kind: 'spare', ids: [], points: 0, combo: this.combo, boss };
    } else {
      const combo = this.bumpCombo();
      const n = ids.length;
      const base = move === 'unsubscribe' ? 25 * n + 500 : 10 * n;
      hit = { kind: move, ids, points: base * combo, combo, boss };
      boss.status = move === 'archive' ? 'archived' : move === 'trash' ? 'trashed' : 'unsubscribed';
      if (move === 'trash') this.stats.trashed += n; else this.stats.archived += n;
      if (move === 'unsubscribe') this.stats.unsubscribed++;
      this.stats.bossesDown++;
      this.inboxLeft -= n;
      this.score += hit.points;
    }
    this.afterAction();
    this.bossIdx++;
    if (this.bossIdx >= this.bosses.length) this.phase = this.horde.length ? 'horde' : 'done';
    this.finishIfDone();
    this.history.push({ ...snap, hit });
    return hit;
  }

  /**
   * Hits the next horde email, or the one with `id` (the triage board lets the player pick
   * any card in the queue). It is moved to the front for the hit; the snapshot keeps the
   * original order so undo can put every card back exactly where it was.
   */
  hitMail(move: HordeMove, id?: string, verdict?: Verdict): Hit | null {
    if (this.phase !== 'horde') return null;
    const at = id
      ? this.horde.findIndex((m, i) => i >= this.hordeIdx && m.id === id)
      : this.hordeIdx;
    if (at < this.hordeIdx || at >= this.horde.length) return null;
    const snap = this.snapshot(null);
    if (at > this.hordeIdx) this.horde.splice(this.hordeIdx, 0, ...this.horde.splice(at, 1));
    const mail = this.mail;
    if (!mail) return null;
    const combo = this.bumpCombo(this.hordeComboWindowMs);
    const points = ((move === 'star' ? 50 : 100) + (verdict === 'sharp' ? SHARP_BONUS : 0)) * combo;
    this.stats.calls++;
    if (verdict === 'sharp') this.stats.sharp++;
    if (verdict === 'missed') this.missed.push(mail);
    if (move === 'archive') this.stats.archived++;
    else if (move === 'trash') this.stats.trashed++;
    else { this.stats.starred++; this.quests.push(mail); }
    // A quest is starred and archived: it leaves the inbox and waits in Starred.
    this.inboxLeft -= 1;
    this.score += points;
    this.afterAction();
    this.hordeIdx++;
    if (this.hordeIdx >= this.horde.length) this.phase = 'done';
    this.finishIfDone();
    const hit: Hit = { kind: move, ids: [mail.id], points, combo, mail, verdict };
    this.history.push({ ...snap, hit });
    return hit;
  }

  hasDraft(id: string): boolean { return this.draftedIds.has(id); }

  /** Rewards a successfully created draft exactly once per message and per raid. */
  rewardDraft(id: string, points: number): boolean {
    if (this.draftedIds.has(id)) return false;
    this.draftedIds.add(id);
    this.score += points;
    this.stats.drafts++;
    for (const s of this.history) { s.score += points; s.stats.drafts++; }
    return true;
  }

  /** Badges are run memories: undoing a hit does not erase an achievement already seen. */
  /** Badges to show right now: INBOX ZERO only while the inbox really is at zero. */
  get shownBadges(): BadgeId[] {
    return [...this.badges].filter((id) => id !== 'zero' || this.inboxLeft === 0);
  }

  /** Eagle Eye: a real horde, every call safe. */
  get eagleEye(): boolean {
    return this.phase === 'done' && this.stats.calls >= EAGLE_MIN_CALLS && this.missed.length === 0;
  }

  unlockBadge(id: BadgeId): boolean {
    if (this.badges.has(id)) return false;
    this.badges.add(id);
    return true;
  }

  /** Time the game stood still (reading a briefing) counts for nothing: no clock, combo or stress. */
  paused(ms: number) {
    if (!this.endedAt) this.startedAt += ms;
    this.waited(ms);
  }

  /** Rolls the game back one hit. Returns that hit so the source can undo it too. */
  undo(): Hit | null {
    const s = this.history.pop();
    if (!s) return null;
    this.phase = s.phase;
    this.bossIdx = s.bossIdx;
    this.hordeIdx = s.hordeIdx;
    this.inboxLeft = s.inboxLeft;
    this.score = s.score;
    this.combo = s.combo;
    this.stress = s.stress;
    this.stats = s.stats;
    this.quests.length = s.quests;
    this.missed.length = s.missed;
    this.lastActionAt = s.lastActionAt;
    this.horde.splice(0, this.horde.length, ...s.horde);
    if (s.hit.boss && s.bossStatus) s.hit.boss.status = s.bossStatus;
    this.endedAt = 0;
    this.idleSince = performance.now();
    return s.hit;
  }

  /** Advances the stress meter. Returns true when it just overflowed. */
  tick(dtMs: number): boolean {
    if (this.phase === 'done') return false;
    dtMs = Math.min(dtMs, 100); // a frozen tab must not dump seconds of stress at once
    const grace = this.phase === 'boss' ? 6000 : 3500;
    const idle = performance.now() - this.idleSince;
    if (idle > grace) this.stress = Math.min(100, this.stress + dtMs * 0.012);
    if (this.stress >= 100) {
      this.stress = 55;
      this.combo = 1;
      this.idleSince = performance.now();
      return true;
    }
    return false;
  }

  private bumpCombo(windowMs = COMBO_WINDOW_MS): number {
    const now = performance.now();
    this.combo = this.lastActionAt > 0 && now - this.lastActionAt < windowMs
      ? Math.min(MAX_COMBO, this.combo + 1)
      : 1;
    this.lastActionAt = now;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    return this.combo;
  }

  private afterAction() {
    this.stress = Math.max(0, this.stress - 18);
    this.idleSince = performance.now();
  }

  private finishIfDone() {
    if (this.phase === 'done' && !this.endedAt) this.endedAt = performance.now();
  }

  private snapshot(bossStatus: BossStatus | null): Omit<Snapshot, 'hit'> {
    return {
      phase: this.phase, bossIdx: this.bossIdx, hordeIdx: this.hordeIdx, inboxLeft: this.inboxLeft,
      score: this.score, combo: this.combo, stress: this.stress, stats: { ...this.stats },
      quests: this.quests.length, missed: this.missed.length, bossStatus, lastActionAt: this.lastActionAt, horde: [...this.horde],
    };
  }
}
