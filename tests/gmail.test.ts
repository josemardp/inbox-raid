// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeWords, GmailSource, parseFrom } from '../src/gmailSource';
import { AuthExpiredError, unsubPlan } from '../src/types';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function decodeRaw(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('parseFrom', () => {
  it.each([
    ['"Doe, John \\"JD\\"" <jd@corp.com>', 'Doe, John "JD"', 'jd@corp.com'],
    ['Loja <a<b> <real@shop.com>', 'Loja <a<b>', 'real@shop.com'],
    ['a@b.com (Some Name)', 'Some Name', 'a@b.com'],
    ['plain@x.com', 'plain@x.com', 'plain@x.com'],
    ['<only@x.com>', 'only@x.com', 'only@x.com'],
    ['Maria <m@x.com> (Sales)', 'Maria', 'm@x.com'],
  ])('%s', (input, name, email) => {
    expect(parseFrom(input)).toEqual([name, email]);
  });
});

describe('decodeWords', () => {
  it('decodes RFC 2047 base64 and quoted-printable words, leaves plain text alone', () => {
    expect(decodeWords('=?UTF-8?B?Sm9zw6kgU2lsdmE=?=')).toBe('José Silva');
    expect(decodeWords('=?UTF-8?Q?Promo=C3=A7=C3=A3o_de_Natal?=')).toBe('Promoção de Natal');
    expect(decodeWords('=?UTF-8?Q?Ol=C3=A1?= =?UTF-8?Q?_mundo?=')).toBe('Olá mundo');
    expect(decodeWords('Plain subject = fine?')).toBe('Plain subject = fine?');
  });
});

describe('unsubPlan', () => {
  const from = 'news@x.com';
  it('never plans a background POST to plain http (mixed content)', () => {
    expect(unsubPlan({ fromEmail: from, listUnsubscribe: '<http://x.com/u>', oneClickUnsub: true } as never).kind).toBe('link');
  });

  it('prefers one-click, then mailto, then a plain link', () => {
    const h = '<mailto:u@x.com?subject=bye>, <https://x.com/u>';
    expect(unsubPlan({ fromEmail: from, listUnsubscribe: h, oneClickUnsub: true } as never).kind).toBe('one-click');
    expect(unsubPlan({ fromEmail: from, listUnsubscribe: h } as never).kind).toBe('mailto');
    expect(unsubPlan({ fromEmail: from, listUnsubscribe: '<https://x.com/u>' } as never).kind).toBe('link');
    expect(unsubPlan(undefined).kind).toBe('none');
  });

  it('uses the https link for one-click even when an http one comes first', () => {
    const p = unsubPlan({ fromEmail: from, listUnsubscribe: '<http://x.com/a>, <https://x.com/b>', oneClickUnsub: true } as never);
    expect(p).toEqual({ kind: 'one-click', url: 'https://x.com/b' });
  });

  it("only mails an unsubscribe to the sender's own site", () => {
    expect(unsubPlan({ fromEmail: 'news@mail.shop.com.br', listUnsubscribe: '<mailto:sair@shop.com.br>' } as never).kind).toBe('mailto');
    expect(unsubPlan({ fromEmail: 'news@shop.com', listUnsubscribe: '<mailto:boss@third.party>' } as never).kind).toBe('none');
    expect(unsubPlan({ fromEmail: 'news@shop.com', listUnsubscribe: '<mailto:boss@third.party>, <https://shop.com/u>' } as never).kind).toBe('link');
  });
});

describe('GmailSource unsubscribe by mailto', () => {
  it('cannot be tricked into adding recipients or headers (CRLF injection)', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).raw);
      return json({ id: 'x' });
    }));
    const g = new GmailSource('t');
    const res = await g.unsubscribe({ kind: 'mailto', url: 'mailto:list@shop.com?subject=unsubscribe%0D%0ABcc:%20victim@third.party&body=bye' });
    expect(res.ok).toBe(true);
    const msg = decodeRaw(sent[0]);
    const headers = msg.split('\r\n\r\n')[0];
    expect(headers).not.toMatch(/^Bcc:/im);
    expect(headers).toMatch(/^To: list@shop\.com$/m);
    expect(headers).toMatch(/^MIME-Version: 1\.0$/m);
  });

  it('refuses a mailto with several or invalid recipients', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const g = new GmailSource('t');
    const res = await g.unsubscribe({ kind: 'mailto', url: 'mailto:a@x.com,b@y.com' });
    expect(res.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("always sends its own words, never the sender's subject or body", async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body)).raw); return json({}); }));
    const g = new GmailSource('t');
    await g.unsubscribe({ kind: 'mailto', url: 'mailto:a@x.com?subject=I%20resign&body=Effective%20today' });
    const msg = decodeRaw(sent[0]);
    expect(msg).toMatch(/^Subject: unsubscribe$/m);
    expect(msg).not.toMatch(/resign|Effective/);
    // Undo and U again: the request is not sent twice.
    await g.unsubscribe({ kind: 'mailto', url: 'mailto:a@x.com' });
    expect(sent).toHaveLength(1);
  });
});

/** A tiny fake Gmail: 5 inbox emails, one broken, a 429 on the first read. */
function fakeGmail(opts: { total?: number; brokenId?: string; rateLimitOnce?: boolean; status401?: boolean } = {}) {
  let limited = !opts.rateLimitOnce;
  return vi.fn(async (url: string) => {
    if (opts.status401) return json({}, 401);
    if (url.endsWith('/labels/INBOX')) return json({ messagesTotal: opts.total ?? 5 });
    if (url.endsWith('/profile')) return json({ emailAddress: 'me@gmail.com' });
    if (url.includes('/messages?')) return json({ messages: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })) });
    const id = url.split('/messages/')[1].split('?')[0];
    if (!limited) { limited = true; return json({ error: 'rate' }, 429, { 'Retry-After': '20' }); }
    if (id === opts.brokenId) return json({ error: 'gone' }, 404);
    return json({
      id, labelIds: id === 'a' ? ['INBOX', 'STARRED'] : ['INBOX'], snippet: 'hi &amp; bye', internalDate: '1000',
      payload: { headers: [{ name: 'From', value: `Shop <news@shop.com>` }, { name: 'Subject', value: `s-${id}` }] },
    });
  });
}

describe('GmailSource.load', () => {
  it('skips one broken email instead of failing the whole scan', async () => {
    vi.stubGlobal('fetch', fakeGmail({ brokenId: 'c' }));
    const mails = await new GmailSource('t').load(() => {});
    expect(mails.map((m) => m.id).sort()).toEqual(['a', 'b', 'd', 'e']);
    expect(mails[0].snippet).toBe('hi & bye');
  });

  it('waits out a rate limit (429) instead of giving up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    vi.stubGlobal('fetch', fakeGmail({ rateLimitOnce: true }));
    const notes: string[] = [];
    const p = new GmailSource('t').load((_n, _t, note) => { if (note) notes.push(note); });
    await vi.advanceTimersByTimeAsync(60_000);
    const mails = await p;
    expect(mails).toHaveLength(5);
    expect(notes.some((x) => /slow down/i.test(x))).toBe(true);
  });

  it('reports the real inbox size and the right account link', async () => {
    vi.stubGlobal('fetch', fakeGmail({ total: 8000 }));
    const g = new GmailSource('t');
    await g.load(() => {});
    expect(g.inboxTotal).toBe(8000);
    expect(g.inboxUrl).toContain('authuser=me%40gmail.com');
  });

  it('stops the scan on a 403 (no access) instead of showing an empty inbox', async () => {
    const gmail = fakeGmail();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/messages/') ? json({ error: 'forbidden' }, 403) : gmail(url))));
    await expect(new GmailSource('t').load(() => {})).rejects.toThrow(/403/);
  });

  it('can be cancelled mid-scan', async () => {
    vi.stubGlobal('fetch', fakeGmail());
    const g = new GmailSource('t');
    const p = g.load(() => {});
    g.cancel();
    await expect(p).rejects.toThrow(/cancelled/);
  });

  it('turns a 401 into AuthExpiredError', async () => {
    vi.stubGlobal('fetch', fakeGmail({ status401: true }));
    await expect(new GmailSource('t').load(() => {})).rejects.toBeInstanceOf(AuthExpiredError);
  });
});

describe('GmailSource.trash', () => {
  it('falls back to per-message trash and untrash if Gmail refuses TRASH in batchModify', async () => {
    const hits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      hits.push(url.replace(/^.*\/users\/me/, ''));
      if (url.endsWith('/batchModify') && String(init?.body).includes('TRASH')) return json({ error: 'Invalid label' }, 400);
      return new Response(null, { status: 204 });
    }));
    const g = new GmailSource('t');
    await g.trash(['x', 'y']);
    expect(hits).toContain('/messages/x/trash');
    expect(hits).toContain('/messages/y/trash');
    hits.length = 0;
    await g.undo('trash', ['x']);
    expect(hits).toContain('/messages/x/untrash');
  });

  it('puts back the emails already trashed when the fallback fails halfway', async () => {
    const hits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      hits.push(url.replace(/^.*\/users\/me/, ''));
      if (url.endsWith('/batchModify') && String(init?.body).includes('TRASH')) return json({ error: 'Invalid label' }, 400);
      if (url.endsWith('/messages/y/trash')) return json({ error: 'nope' }, 400);
      return new Response(null, { status: 204 });
    }));
    await expect(new GmailSource('t').trash(['x', 'y'])).rejects.toThrow(/refused trash/);
    expect(hits).toContain('/messages/x/trash');
    expect(hits).toContain('/messages/x/untrash');
  });

  it('uses one batchModify when Gmail accepts TRASH (the documented path)', async () => {
    const hits: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { hits.push(url); return new Response(null, { status: 204 }); }));
    await new GmailSource('t').trash(['x', 'y']);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/batchModify$/);
  });
});

describe('GmailSource.undo', () => {
  it('keeps stars that existed before the raid', async () => {
    const calls: { ids: string[]; addLabelIds: string[]; removeLabelIds: string[] }[] = [];
    const gmail = fakeGmail();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/batchModify')) { calls.push(JSON.parse(String(init!.body))); return new Response(null, { status: 204 }); }
      return gmail(url);
    }));
    const g = new GmailSource('t');
    await g.load(() => {});
    await g.undo('star', ['a', 'b']);
    const fresh = calls.find((c) => c.ids.includes('b'))!;
    const old = calls.find((c) => c.ids.includes('a'))!;
    expect(fresh.removeLabelIds).toContain('STARRED');
    expect(old.removeLabelIds).not.toContain('STARRED');
    expect(old.addLabelIds).toContain('INBOX');
  });
});
