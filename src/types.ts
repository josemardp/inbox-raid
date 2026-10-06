export interface Mail {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: number; // epoch ms
  /** Raw List-Unsubscribe header, when the sender provides one. */
  listUnsubscribe?: string;
  /** True when List-Unsubscribe-Post says one-click is supported (RFC 8058). */
  oneClickUnsub?: boolean;
  /** Already starred before the raid, so undoing a quest must keep the star. */
  starred?: boolean;
}

/** How a sender can be unsubscribed, from its List-Unsubscribe header. */
export interface UnsubPlan {
  kind: 'one-click' | 'mailto' | 'link' | 'none';
  url: string;
}

export function unsubPlan(m: Mail | undefined): UnsubPlan {
  const links = [...(m?.listUnsubscribe ?? '').matchAll(/<([^>]+)>/g)].map((x) => x[1].trim());
  const http = links.find((l) => /^https?:\/\//i.test(l));
  const mailto = links.find((l) => /^mailto:/i.test(l));
  // A background POST to plain http:// is blocked from an https page (mixed content),
  // so one-click needs https; an http link can still be opened as a page.
  if (http && /^https:/i.test(http) && m?.oneClickUnsub) return { kind: 'one-click', url: http };
  if (mailto) return { kind: 'mailto', url: mailto };
  if (http) return { kind: 'link', url: http };
  return { kind: 'none', url: '' };
}

export type ActionKind = 'archive' | 'trash' | 'star' | 'unsubscribe';

export interface UnsubResult {
  ok: boolean;
  /** How it was done, shown to the player. */
  method: 'one-click' | 'mailto' | 'link' | 'none' | 'demo';
}

/** Where the emails come from and where actions really happen. */
export interface InboxSource {
  readonly label: string;
  readonly isDemo: boolean;
  /** Real size of the inbox after load(); can be larger than what was scanned. */
  readonly inboxTotal: number;
  /** Link that opens this inbox (right account), shown on the final screen. */
  readonly inboxUrl: string;
  load(onProgress: (loaded: number, total: number, note?: string) => void): Promise<Mail[]>;
  archive(ids: string[]): Promise<void>;
  trash(ids: string[]): Promise<void>;
  /** Quest: star it and take it out of the inbox, so it waits in Starred. */
  star(ids: string[]): Promise<void>;
  /** Sends the unsubscribe for one-click or mailto plans. Links are opened by the UI, inside the click. */
  unsubscribe(plan: UnsubPlan): Promise<UnsubResult>;
  /** Puts emails back in the inbox exactly as before the action. */
  undo(kind: ActionKind, ids: string[]): Promise<void>;
}

/** The Google session ended; the player must reconnect (needs a click). */
export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); }
}
