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
  const https = links.find((l) => /^https:\/\//i.test(l));
  const http = https ?? links.find((l) => /^http:\/\//i.test(l));
  // The address comes from the sender: only mail an unsubscribe to the sender's own site.
  const mailto = links.find((l) => /^mailto:/i.test(l) && sameSite(mailtoAddress(l), m?.fromEmail ?? ''));
  // A background POST to plain http:// is blocked from an https page (mixed content),
  // so one-click needs https; an http link can still be opened as a page.
  if (https && m?.oneClickUnsub) return { kind: 'one-click', url: https };
  if (mailto) return { kind: 'mailto', url: mailto };
  if (http) return { kind: 'link', url: http };
  return { kind: 'none', url: '' };
}

/** mailto:list@shop.com?subject=x -> list@shop.com ('' if it cannot be read). */
export function mailtoAddress(url: string): string {
  try {
    return decodeURIComponent(url.replace(/^mailto:/i, '').split('?')[0]).replace(/[\r\n]+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** news.shop.com.br -> shop.com.br; mail.x.co.uk -> x.co.uk; a.b.com -> b.com */
function site(host: string): string {
  const p = host.toLowerCase().split('.').filter(Boolean);
  const twoPart = p.length > 2 && p.at(-1)!.length === 2 && /^(com|net|org|gov|edu|co|ac|ne|or|go|gob|mil)$/.test(p.at(-2)!);
  return p.slice(twoPart ? -3 : -2).join('.');
}

function sameSite(a: string, b: string): boolean {
  const ha = a.split('@')[1];
  const hb = b.split('@')[1];
  return !!ha && !!hb && site(ha) === site(hb);
}

export type ActionKind = 'archive' | 'trash' | 'star' | 'unsubscribe';

export interface UnsubResult {
  /** The request went out. */
  ok: boolean;
  /**
   * We saw it accepted (Gmail sent the email). A one-click POST is opaque from the browser:
   * it is requested, never confirmed.
   */
  confirmed: boolean;
  /** How it was done, shown to the player. */
  method: 'one-click' | 'mailto' | 'link' | 'none' | 'demo';
}

/** One email read in full, for a quest briefing. */
export interface MailBody {
  /** Plain text only: HTML is stripped, never rendered. */
  text: string;
  /** Where a reply goes (Reply-To, else From). */
  replyTo: string;
  /** Message-ID, so a draft lands in the same conversation. */
  messageId: string;
  threadId: string;
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
  /** Reads one email in full, only when the player opens its briefing. */
  read(mail: Mail): Promise<MailBody>;
  /** Saves a reply as a Gmail draft. Never sends: the player sends it from Gmail, or not. */
  draft(mail: Mail, body: MailBody, text: string): Promise<void>;
  /** Stops a scan in progress (its load() then rejects). */
  cancel?(): void;
  /** Rereads the real inbox size, for an honest INBOX ZERO. */
  countInbox?(): Promise<number>;
}

/** The Google session ended; the player must reconnect (needs a click). */
export class AuthExpiredError extends Error {
  constructor() { super('Google session expired'); }
}
