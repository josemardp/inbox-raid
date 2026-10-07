import { t } from './i18n';
import { AuthExpiredError, mailtoAddress, type ActionKind, type InboxSource, type Mail, type MailBody, type UnsubPlan, type UnsubResult } from './types';

// Real mode. Talks to the Gmail API straight from the browser with a short-lived token.
// No server, no stored credentials. Scope gmail.modify cannot permanently delete anything.

const CLIENT_ID = '653389391490-ilem4mi1lhkd76ta36ct5i8sob5bbuld.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Quota for projects created after May 2026: 6,000 units per user per minute, and
// messages.get costs 20. So reads are paced at 4 per second (4,800 units a minute).
const MAX_MAILS = 500;
const READS_PER_SECOND = 4;
const WORKERS = 4;

interface TokenResponse { access_token?: string; error?: string }
interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): { requestAccessToken(o?: { prompt?: string }): void };
      hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
    };
  };
}

let gisPromise: Promise<GoogleOAuth> | null = null;

function loadGis(): Promise<GoogleOAuth> {
  const w = window as unknown as { google?: GoogleOAuth };
  if (w.google?.accounts) return Promise.resolve(w.google);
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve(w.google!);
    s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Loads Google's script only when the player points at the Gmail button, not for demo players. */
export function preloadGoogle() {
  loadGis().catch(() => { /* retried on sign-in */ });
}

/** Opens Google's consent popup. Must be called from a click or key press. */
export async function signIn(): Promise<string> {
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error || 'Sign-in failed'));
        // The consent screen lets people untick Gmail access; without it nothing works.
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error('Gmail access was not granted'));
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e.type)),
    });
    client.requestAccessToken();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** "Doe, John" <jd@corp.com> -> ["Doe, John", "jd@corp.com"]; also "a@b.com (Name)", a trailing (comment) and bare addresses. */
export function parseFrom(v: string): [string, string] {
  const angle = v.match(/<([^<>]+)>\s*(?:\([^()]*\)\s*)?$/);
  if (angle) {
    const email = angle[1].trim();
    const name = v.slice(0, angle.index).trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim();
    return [name || email, email];
  }
  const paren = v.match(/^\s*([^\s()]+@[^\s()]+)\s*\(([^)]*)\)\s*$/);
  if (paren) return [paren[2].trim() || paren[1], paren[1]];
  return [v.trim(), v.trim()];
}

export class GmailError extends Error {
  constructor(readonly status: number, body: string) { super(`Gmail ${status}: ${body}`); }
}

/**
 * One worker loop per slot. A failure the caller tolerates is counted and skipped;
 * anything else stops the whole run.
 */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>, tolerate: (err: unknown) => boolean): Promise<number> {
  let i = 0;
  let failed = 0;
  let stop: unknown = null;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !stop) {
      const item = items[i++];
      try { await fn(item); } catch (err) {
        if (err instanceof AuthExpiredError || !tolerate(err)) { stop ??= err; return; }
        failed++;
        console.warn('Skipped one email:', err);
      }
    }
  }));
  if (stop) throw stop;
  return failed;
}

const EMAIL = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/;

/** Actions happen while the player waits: a few quick retries, never the scan's long waits. */
const QUICK = { tries: 2, quick: true };

export class GmailSource implements InboxSource {
  readonly label = 'YOUR GMAIL';
  readonly isDemo = false;
  inboxTotal = 0;
  inboxUrl = 'https://mail.google.com/mail/#inbox';
  private wasStarred = new Set<string>();
  /** Unsubscribes already sent this session, so undo + U again does not send twice. */
  private sent = new Set<string>();
  private nextReadAt = 0;
  private cancelled = false;
  /** Tells the player why Gmail is making them wait (scan screen or a toast). */
  onWait: (note: string) => void = () => {};

  constructor(private token: string) {}

  setToken(token: string) { this.token = token; }

  cancel() { this.cancelled = true; }

  private async call<T>(path: string, init: RequestInit = {}, opts: { tries?: number; quick?: boolean } = {}, attempt = 0): Promise<T> {
    const tries = opts.tries ?? 6;
    const again = async (waitMs: number, note: string) => {
      this.onWait(note);
      await sleep(waitMs);
      return this.call<T>(path, init, opts, attempt + 1);
    };
    const backoff = 1000 * 2 ** attempt; // 1 s, 2 s, 4 s
    let res: Response;
    try {
      res = await fetch(path.startsWith('http') ? path : API + path, {
        ...init,
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });
    } catch (err) {
      if (attempt >= tries) throw err;
      return again(opts.quick ? backoff : 1500, t('gmail.noAnswer'));
    }
    if (res.status === 401) throw new AuthExpiredError();
    const limited = res.status === 429 || (res.status === 403 && /rate/i.test(await res.clone().text()));
    if ((limited || res.status >= 500) && attempt < tries) {
      // The scan waits for the per-minute quota to refill; an action only retries briefly.
      const retryAfter = Number(res.headers.get('Retry-After')) || 0;
      const waitMs = opts.quick ? backoff : res.status >= 500 ? 2000 : Math.max(retryAfter * 1000, 15_000);
      return again(waitMs, res.status >= 500 ? t('gmail.hiccup') : t('gmail.slow'));
    }
    if (!res.ok) throw new GmailError(res.status, await res.text());
    return res.status === 204 ? (undefined as T) : res.json();
  }

  async countInbox(): Promise<number> {
    return (await this.call<{ messagesTotal: number }>('/labels/INBOX', {}, QUICK)).messagesTotal;
  }

  /** Spaces reads so the per-minute quota is never hit. */
  private async paced() {
    const now = performance.now();
    const at = Math.max(now, this.nextReadAt);
    this.nextReadAt = at + 1000 / READS_PER_SECOND;
    if (at > now) await sleep(at - now);
  }

  async load(onProgress: (loaded: number, total: number, note?: string) => void): Promise<Mail[]> {
    const notify = this.onWait;
    this.cancelled = false;
    this.wasStarred.clear();
    try {
      return await this.scan(onProgress);
    } finally {
      this.onWait = notify;
    }
  }

  private async scan(onProgress: (loaded: number, total: number, note?: string) => void): Promise<Mail[]> {
    const [label, profile] = await Promise.all([
      this.call<{ messagesTotal: number }>('/labels/INBOX'),
      this.call<{ emailAddress: string }>('/profile'),
    ]);
    this.inboxTotal = label.messagesTotal;
    this.inboxUrl = `https://mail.google.com/mail/?authuser=${encodeURIComponent(profile.emailAddress)}#inbox`;

    const ids: string[] = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ q: 'in:inbox', maxResults: '500' });
      if (pageToken) q.set('pageToken', pageToken);
      const page = await this.call<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${q}`);
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken ?? '';
    } while (pageToken && ids.length < MAX_MAILS);

    const todo = ids.slice(0, MAX_MAILS);
    const mails: Mail[] = [];
    onProgress(0, todo.length);
    this.onWait = (note) => onProgress(mails.length, todo.length, note);
    const meta = ['From', 'Subject', 'List-Unsubscribe', 'List-Unsubscribe-Post']
      .map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join('&');
    const fields = 'fields=id,labelIds,snippet,internalDate,payload/headers';
    const failed = await pool(todo, WORKERS, async (id) => {
      if (this.cancelled) throw new Error('Scan cancelled');
      await this.paced();
      if (this.cancelled) throw new Error('Scan cancelled');
      const m =await this.call<{ id: string; labelIds?: string[]; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } }>(
        `/messages/${id}?format=metadata&${meta}&${fields}`);
      const h = m.payload.headers;
      const [fromName, fromEmail] = parseFrom(decodeWords(header(h, 'From')));
      const starred = !!m.labelIds?.includes('STARRED');
      if (starred) this.wasStarred.add(m.id);
      mails.push({
        id: m.id,
        fromName,
        fromEmail: fromEmail.toLowerCase(),
        subject: decodeWords(header(h, 'Subject')),
        snippet: decodeEntities(m.snippet),
        date: Number(m.internalDate),
        listUnsubscribe: header(h, 'List-Unsubscribe') || undefined,
        // RFC 8058 asks for this exact value.
        oneClickUnsub: /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i.test(header(h, 'List-Unsubscribe-Post')),
        starred,
      });
      onProgress(mails.length, todo.length);
    }, (err) => err instanceof GmailError && err.status === 404); // an email deleted mid-scan; a 403 means no access
    if (failed) console.warn(`${failed} emails could not be read and were left alone.`);
    onProgress(mails.length, todo.length);
    return mails.sort((a, b) => b.date - a.date);
  }

  private async modify(ids: string[], add: string[], remove: string[]) {
    for (let i = 0; i < ids.length; i += 1000) {
      await this.call('/messages/batchModify', {
        method: 'POST',
        body: JSON.stringify({ ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove }),
      }, QUICK);
    }
  }

  archive(ids: string[]) { return this.modify(ids, [], ['INBOX']); }
  star(ids: string[]) { return this.modify(ids, ['STARRED'], ['INBOX']); }

  // Google's docs say TRASH can be applied with batchModify. If Gmail ever refuses it
  // (400), fall back to the dedicated per-message trash and untrash endpoints.
  async trash(ids: string[]) {
    try {
      await this.modify(ids, ['TRASH'], ['INBOX']);
    } catch (err) {
      if (!/Gmail 400/.test(String(err))) throw err;
      await this.perMessage(ids, 'trash');
    }
  }

  private async untrash(ids: string[]) {
    try {
      await this.modify(ids, ['INBOX'], ['TRASH']);
    } catch (err) {
      if (!/Gmail 400/.test(String(err))) throw err;
      await this.perMessage(ids, 'untrash');
      await this.modify(ids, ['INBOX'], []);
    }
  }

  /** All or nothing: if some emails fail, the ones already moved are put back, so the game can roll back honestly. */
  private async perMessage(ids: string[], op: 'trash' | 'untrash') {
    const done: string[] = [];
    let failed = 0;
    try {
      failed = await pool(ids, WORKERS, async (id) => {
        await this.paced();
        await this.call(`/messages/${id}/${op}`, { method: 'POST' }, QUICK);
        done.push(id);
      }, () => true);
    } catch (err) {
      failed = ids.length - done.length;
      if (err instanceof AuthExpiredError) throw err;
    }
    if (!failed) return;
    if (op === 'trash' && done.length) {
      try {
        await this.perMessage(done, 'untrash');
        await this.modify(done, ['INBOX'], []);
      } catch (err) {
        console.error('Could not put back', done, err);
        throw new Error(`Gmail refused trash for ${failed} emails; ${done.length} may still be in Trash`);
      }
    }
    throw new Error(`Gmail refused ${op} for ${failed} emails`);
  }

  async undo(kind: ActionKind, ids: string[]) {
    if (kind === 'trash') return this.untrash(ids);
    if (kind === 'star') {
      // Keep stars that were there before the raid.
      const fresh = ids.filter((id) => !this.wasStarred.has(id));
      const old = ids.filter((id) => this.wasStarred.has(id));
      if (fresh.length) await this.modify(fresh, ['INBOX'], ['STARRED']);
      if (old.length) await this.modify(old, ['INBOX'], []);
      return;
    }
    return this.modify(ids, ['INBOX'], []);
  }

  async read(mail: Mail): Promise<MailBody> {
    await this.paced();
    const m = await this.call<{ threadId: string; payload: Part }>(`/messages/${mail.id}?format=full`, {}, QUICK);
    const h = m.payload.headers ?? [];
    const [, replyTo] = parseFrom(decodeWords(header(h, 'Reply-To') || header(h, 'From')));
    return {
      text: bodyText(m.payload) || mail.snippet,
      replyTo: EMAIL.test(replyTo) ? replyTo : mail.fromEmail,
      messageId: header(h, 'Message-ID').replace(/[\r\n]/g, ''),
      threadId: m.threadId,
    };
  }

  async draft(mail: Mail, body: MailBody, text: string) {
    const subject = (/^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject}`).replace(/[\r\n]+/g, ' ');
    const raw = [
      `To: ${EMAIL.test(body.replyTo) ? body.replyTo : mail.fromEmail}`,
      `Subject: ${encodeWord(subject)}`,
      ...(body.messageId ? [`In-Reply-To: ${body.messageId}`, `References: ${body.messageId}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64(text).replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n');
    // A draft is only saved, never sent. No retries, so a slow Gmail cannot make two.
    await this.call('/drafts', { method: 'POST', body: JSON.stringify({ message: { raw: base64url(raw), ...(body.threadId ? { threadId: body.threadId } : {}) } }) }, { tries: 0 });
  }

  async unsubscribe(plan: UnsubPlan): Promise<UnsubResult> {
    if (plan.kind === 'one-click') {
      if (this.sent.has(plan.url)) return { ok: true, confirmed: false, method: 'one-click' };
      // RFC 8058: a plain form POST. The response is opaque from a browser, so the game
      // only knows the request went out, not that the sender accepted it.
      await fetch(plan.url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        signal: AbortSignal.timeout(8000),
      });
      this.sent.add(plan.url);
      return { ok: true, confirmed: false, method: 'one-click' };
    }
    if (plan.kind === 'mailto') {
      const to = mailtoAddress(plan.url);
      // The header comes from the sender: never let it add recipients or headers.
      if (!EMAIL.test(to)) return { ok: false, confirmed: false, method: 'none' };
      if (this.sent.has(to)) return { ok: true, confirmed: true, method: 'mailto' };
      // Subject and body are always ours: a sender cannot make the player send its words.
      const raw = [
        `To: ${to}`,
        'Subject: unsubscribe',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        'unsubscribe',
      ].join('\r\n');
      // No retries: a retried send would unsubscribe twice.
      await this.call('/messages/send', { method: 'POST', body: JSON.stringify({ raw: base64url(raw) }) }, { tries: 0 });
      this.sent.add(to);
      return { ok: true, confirmed: true, method: 'mailto' };
    }
    return { ok: false, confirmed: false, method: plan.kind === 'link' ? 'link' : 'none' };
  }
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** A header value in UTF-8 encoded-word form when it is not plain ASCII. */
function encodeWord(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`;
}

interface Part {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Part[];
}

function decodePart(p: Part): string {
  const data = p.body?.data;
  if (!data) return '';
  const charset = /charset="?([\w-]+)/i.exec(header(p.headers ?? [], 'Content-Type'))?.[1] ?? 'utf-8';
  const bytes = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

function findPart(p: Part, type: string): Part | undefined {
  if (p.mimeType === type && p.body?.data) return p;
  for (const c of p.parts ?? []) {
    const hit = findPart(c, type);
    if (hit) return hit;
  }
  return undefined;
}

/** The readable text of an email: its text/plain part, else its HTML reduced to text (never rendered). */
export function bodyText(p: Part): string {
  const plain = findPart(p, 'text/plain');
  if (plain) return tidy(decodePart(plain));
  const html = findPart(p, 'text/html');
  if (!html) return '';
  // DOMParser never runs scripts or loads images: it only turns markup into text.
  const doc = new DOMParser().parseFromString(decodePart(html), 'text/html');
  doc.querySelectorAll('script, style, head, title').forEach((el) => el.remove());
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  doc.querySelectorAll('p, div, tr, li, h1, h2, h3, h4, table').forEach((el) => el.append('\n'));
  return tidy(doc.body?.textContent ?? '');
}

function tidy(s: string): string {
  return s.replace(/\r/g, '').replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000);
}

function base64url(s: string): string {
  return base64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * RFC 2047 encoded-words (=?UTF-8?B?...?= or =?ISO-8859-1?Q?...?=), in case a header
 * arrives undecoded. Text without encoded-words is returned untouched.
 */
export function decodeWords(s: string): string {
  if (!s.includes('=?')) return s;
  return s
    .replace(/(\?=)\s+(=\?)/g, '$1$2') // whitespace between encoded-words is not content
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
      try {
        const bytes = enc.toUpperCase() === 'B'
          ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
          : Uint8Array.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return whole;
      }
    });
}

function decodeEntities(s: string): string {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
