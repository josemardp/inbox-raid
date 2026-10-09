import { isPerson } from './classifier';
import type { HordeMove } from './raid';
import { brief, type MissionKind } from './suggest';
import type { Mail } from './types';

// Speed alone must not win: a horde call is judged against the same rules as the briefing.
// Only subject, preview and sender are read (what the card shows), so judging costs no request.

/** sharp: the call the briefing would make. missed: it looked like it needed the player. */
export type Verdict = 'sharp' | 'missed' | 'fair';

const NEEDS_YOU: ReadonlySet<MissionKind> = new Set(['bill', 'confirm', 'meeting', 'request', 'question', 'personal']);

export function mailKind(m: Mail): MissionKind {
  return brief(m.subject, m.snippet, m.fromName, isPerson(m), m.fromEmail).kind;
}

export function judgeCall(m: Mail, move: HordeMove): Verdict {
  let kind = mailKind(m);
  // A mailing list "inviting" to a webinar is still a newsletter; only its bills matter.
  if (m.listUnsubscribe && kind !== 'scam' && kind !== 'bill') kind = 'info';
  if (kind === 'scam') return move === 'trash' ? 'sharp' : 'fair';
  if (NEEDS_YOU.has(kind)) return move === 'star' ? 'sharp' : 'missed';
  return move === 'star' ? 'fair' : 'sharp';
}
