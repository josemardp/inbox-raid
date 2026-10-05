import type { ActionKind, InboxSource, Mail, UnsubResult } from './types';

// Real mode. Talks to the Gmail API straight from the browser with a short-lived token.
// No server, no stored credentials. Scope gmail.modify cannot permanently delete anything.

const CLIENT_ID = '653389391490-ilem4mi1lhkd76ta36ct5i8sob5bbuld.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** Big enough for a dramatic raid, small enough to scan in under a minute. */
const MAX_MAILS = 2000;
const CONCURRENCY = 8;

interface TokenResponse { access_token?: string; error?: string }
interface GoogleOAuth {
  accounts: { oauth2: { initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): { requestAccessToken(o?: { prompt?: string }): void } } };
}

function loadGis(): Promise<GoogleOAuth> {
  const w = window as unknown as { google?: GoogleOAuth };
  if (w.google?.accounts) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve(w.google!);
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}

/** Loads Google's script early, so the popup opens inside the click and is not blocked. */
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
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error || 'Sign-in failed'))),
      error_callback: (e) => reject(new Error(e.type)),
    });
    client.requestAccessToken();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** "Name <a@b.com>" -> ["Name", "a@b.com"] */
function parseFrom(v: string): [string, string] {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return [m[1].trim() || m[2], m[2].trim()];
  return [v.trim(), v.trim()];
}

/** Runs fn over items with a fixed number of requests in flight. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export class GmailSource implements InboxSource {
  readonly label = 'YOUR GMAIL';
  readonly isDemo = false;

  constructor(private token: string) {}

  private async call<T>(path: string, init: RequestInit = {}, tries = 4): Promise<T> {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if ((res.status === 429 || res.status >= 500) && tries > 0) {
      await sleep(500 * 2 ** (4 - tries) + Math.random() * 300);
      return this.call<T>(path, init, tries - 1);
    }
    if (!res.ok) throw new Error(`Gmail ${res.status}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json();
  }

  async load(onProgress: (loaded: number, total: number) => void): Promise<Mail[]> {
    const ids: string[] = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ q: 'in:inbox', maxResults: '500' });
      if (pageToken) q.set('pageToken', pageToken);
      const page = await this.call<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${q}`);
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken ?? '';
    } while (pageToken && ids.length < MAX_MAILS);

    const mails: Mail[] = [];
    const todo = ids.slice(0, MAX_MAILS);
    onProgress(0, todo.length);
    const meta = ['From', 'Subject', 'Date', 'List-Unsubscribe', 'List-Unsubscribe-Post']
      .map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join('&');
    await pool(todo, CONCURRENCY, async (id) => {
      const m = await this.call<{ id: string; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } }>(
        `/messages/${id}?format=metadata&${meta}`);
      const h = m.payload.headers;
      const [fromName, fromEmail] = parseFrom(header(h, 'From'));
      mails.push({
        id: m.id,
        fromName,
        fromEmail: fromEmail.toLowerCase(),
        subject: header(h, 'Subject'),
        snippet: decodeEntities(m.snippet),
        date: Number(m.internalDate),
        listUnsubscribe: header(h, 'List-Unsubscribe') || undefined,
        oneClickUnsub: /one-click/i.test(header(h, 'List-Unsubscribe-Post')),
      });
      if (mails.length % 10 === 0) onProgress(mails.length, todo.length);
    });
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

  undo(kind: ActionKind, ids: string[]) {
    if (kind === 'trash') return this.modify(ids, ['INBOX'], ['TRASH']);
    if (kind === 'star') return this.modify(ids, ['INBOX'], ['STARRED']);
    return this.modify(ids, ['INBOX'], []);
  }

  async unsubscribe(sample: Mail): Promise<UnsubResult> {
    const links = [...(sample.listUnsubscribe ?? '').matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
    const http = links.find((l) => l.startsWith('https://') || l.startsWith('http://'));
    const mailto = links.find((l) => l.startsWith('mailto:'));

    // RFC 8058 one-click: a plain form POST. The response is opaque, the request still lands.
    if (http && sample.oneClickUnsub) {
      await fetch(http, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      return { ok: true, method: 'one-click' };
    }
    if (mailto) {
      const url = new URL(mailto);
      const to = decodeURIComponent(url.pathname);
      const subject = url.searchParams.get('subject') || 'unsubscribe';
      const body = url.searchParams.get('body') || 'unsubscribe';
      const raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
      await this.call('/messages/send', { method: 'POST', body: JSON.stringify({ raw: base64url(raw) }) });
      return { ok: true, method: 'mailto' };
    }
    if (http) {
      window.open(http, '_blank', 'noopener');
      return { ok: false, method: 'link' };
    }
    return { ok: false, method: 'none' };
  }
}

function base64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeEntities(s: string): string {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
