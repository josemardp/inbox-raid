import { AuthExpiredError, type ActionKind, type InboxSource, type Mail, type UnsubPlan, type UnsubResult } from './types';

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

/** "Doe, John" <jd@corp.com> -> ["Doe, John", "jd@corp.com"]; also "a@b.com (Name)" and bare addresses. */
export function parseFrom(v: string): [string, string] {
  const angle = v.match(/<([^<>]+)>\s*$/);
  if (angle) {
    const email = angle[1].trim();
    const name = v.slice(0, angle.index).trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim();
    return [name || email, email];
  }
  const paren = v.match(/^\s*([^\s()]+@[^\s()]+)\s*\(([^)]*)\)\s*$/);
  if (paren) return [paren[2].trim() || paren[1], paren[1]];
  return [v.trim(), v.trim()];
}

/** One worker loop per slot; a failing item is counted, never fatal. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<number> {
  let i = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch (err) {
        if (err instanceof AuthExpiredError) throw err;
        failed++;
        console.warn('Skipped one email:', err);
      }
    }
  }));
  return failed;
}

const EMAIL = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/;
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** RFC 2047 encoded-word for non-ASCII subjects. */
function encodeHeader(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`;
}

export class GmailSource implements InboxSource {
  readonly label = 'YOUR GMAIL';
  readonly isDemo = false;
  inboxTotal = 0;
  inboxUrl = 'https://mail.google.com/mail/#inbox';
  private wasStarred = new Set<string>();
  private nextReadAt = 0;
  /** Lets the scan screen say why it is waiting. */
  private onWait: (note: string) => void = () => {};

  constructor(private token: string) {}

  setToken(token: string) { this.token = token; }

  private async call<T>(path: string, init: RequestInit = {}, tries = 6): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path.startsWith('http') ? path : API + path, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });
    } catch (err) {
      if (tries <= 0) throw err;
      await sleep(1500);
      return this.call<T>(path, init, tries - 1);
    }
    if (res.status === 401) throw new AuthExpiredError();
    if ((res.status === 429 || res.status === 403 && /rate/i.test(await res.clone().text()) || res.status >= 500) && tries > 0) {
      // Quota is per minute: wait for it to refill instead of giving up.
      const retryAfter = Number(res.headers.get('Retry-After')) || 0;
      const waitMs = res.status >= 500 ? 2000 : Math.max(retryAfter * 1000, 15_000);
      this.onWait(res.status >= 500 ? 'Gmail hiccup, retrying...' : 'Gmail asked us to slow down...');
      await sleep(waitMs);
      return this.call<T>(path, init, tries - 1);
    }
    if (!res.ok) throw new Error(`Gmail ${res.status}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json();
  }

  /** Spaces reads so the per-minute quota is never hit. */
  private async paced() {
    const now = performance.now();
    const at = Math.max(now, this.nextReadAt);
    this.nextReadAt = at + 1000 / READS_PER_SECOND;
    if (at > now) await sleep(at - now);
  }

  async load(onProgress: (loaded: number, total: number, note?: string) => void): Promise<Mail[]> {
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
      await this.paced();
      const m = await this.call<{ id: string; labelIds?: string[]; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } }>(
        `/messages/${id}?format=metadata&${meta}&${fields}`);
      const h = m.payload.headers;
      const [fromName, fromEmail] = parseFrom(header(h, 'From'));
      const starred = !!m.labelIds?.includes('STARRED');
      if (starred) this.wasStarred.add(m.id);
      mails.push({
        id: m.id,
        fromName,
        fromEmail: fromEmail.toLowerCase(),
        subject: header(h, 'Subject'),
        snippet: decodeEntities(m.snippet),
        date: Number(m.internalDate),
        listUnsubscribe: header(h, 'List-Unsubscribe') || undefined,
        oneClickUnsub: /one-click/i.test(header(h, 'List-Unsubscribe-Post')),
        starred,
      });
      onProgress(mails.length, todo.length);
    });
    this.onWait = () => {};
    if (failed) console.warn(`${failed} emails could not be read and were left alone.`);
    onProgress(mails.length, todo.length);
    return mails.sort((a, b) => b.date - a.date);
  }

  private async modify(ids: string[], add: string[], remove: string[]) {
    for (let i = 0; i < ids.length; i += 1000) {
      await this.call('/messages/batchModify', {
        method: 'POST',
        body: JSON.stringify({ ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove }),
      });
    }
  }

  archive(ids: string[]) { return this.modify(ids, [], ['INBOX']); }
  trash(ids: string[]) { return this.modify(ids, ['TRASH'], ['INBOX']); }
  star(ids: string[]) { return this.modify(ids, ['STARRED'], ['INBOX']); }

  async undo(kind: ActionKind, ids: string[]) {
    if (kind === 'trash') return this.modify(ids, ['INBOX'], ['TRASH']);
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

  async unsubscribe(plan: UnsubPlan): Promise<UnsubResult> {
    if (plan.kind === 'one-click') {
      // RFC 8058: a plain form POST. The response is opaque, the request still lands.
      await fetch(plan.url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      return { ok: true, method: 'one-click' };
    }
    if (plan.kind === 'mailto') {
      const url = new URL(plan.url);
      const to = oneLine(decodeURIComponent(url.pathname));
      // The header comes from the sender: never let it add recipients or headers.
      if (!EMAIL.test(to)) return { ok: false, method: 'none' };
      const subject = oneLine(url.searchParams.get('subject') || 'unsubscribe');
      const body = (url.searchParams.get('body') || 'unsubscribe').replace(/\r?\n/g, '\r\n');
      const raw = [
        `To: ${to}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64(body),
      ].join('\r\n');
      // No retries: a retried send would unsubscribe twice.
      await this.call('/messages/send', { method: 'POST', body: JSON.stringify({ raw: base64url(raw) }) }, 0);
      return { ok: true, method: 'mailto' };
    }
    return { ok: false, method: plan.kind === 'link' ? 'link' : 'none' };
  }
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64url(s: string): string {
  return base64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeEntities(s: string): string {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
