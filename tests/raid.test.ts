import { describe, expect, it, vi } from 'vitest';
import { buildDemoInbox } from '../src/demoInbox';
import { Raid, splitInbox } from '../src/raid';
import type { Mail } from '../src/types';

let n = 0;
const mail = (fromEmail: string, extra: Partial<Mail> = {}): Mail => ({
  id: `m${n++}`, fromName: fromEmail, fromEmail, subject: 's', snippet: '', date: n, ...extra,
});

describe('splitInbox', () => {
  it('the blitz demo reaches two bosses and seven authored horde calls', () => {
    const { bosses, horde, overflow } = splitInbox(buildDemoInbox(1_800_000, 'blitz'));
    expect(bosses.map((b) => b.mails.length)).toEqual([142, 96]);
    expect(horde).toHaveLength(7);
    expect(horde[0].fromEmail).toBe('invoice@totally-legit.example');
    expect(overflow).toBe(0);
  });
  it('turns senders with 3+ emails into bosses, biggest first', () => {
    const mails = [
      ...Array.from({ length: 3 }, () => mail('small@x.com')),
      ...Array.from({ length: 5 }, () => mail('big@x.com')),
      mail('a@y.com'), mail('a@y.com'), mail('b@y.com'),
    ];
    const { bosses, horde, overflow } = splitInbox(mails);
    expect(bosses.map((b) => b.email)).toEqual(['big@x.com', 'small@x.com']);
    expect(horde).toHaveLength(3);
    expect(overflow).toBe(0);
  });

  it('caps the horde and reports the rest as overflow', () => {
    const mails = Array.from({ length: 75 }, (_, i) => mail(`one${i}@x.com`));
    const { horde, overflow } = splitInbox(mails);
    expect(horde).toHaveLength(60);
    expect(overflow).toBe(15);
  });
});

describe('Raid', () => {
  it('never claims inbox zero while emails are outside the raid', () => {
    const { bosses, horde } = splitInbox([mail('x@x.com'), mail('x@x.com'), mail('x@x.com')]);
    const r = new Raid(bosses, horde, 8000);
    expect(r.inboxStart).toBe(8003);
    r.hitBoss('archive');
    expect(r.phase).toBe('done');
    expect(r.inboxLeft).toBe(8000);
  });

  it('a quest leaves the inbox and lands in the quest log', () => {
    const r = new Raid([], [mail('p@x.com')]);
    r.hitMail('star');
    expect(r.inboxLeft).toBe(0);
    expect(r.quests).toHaveLength(1);
  });

  it('undo walks every hit back to the exact starting state', () => {
    const mails = [
      ...Array.from({ length: 4 }, () => mail('boss1@x.com')),
      ...Array.from({ length: 3 }, () => mail('boss2@x.com')),
      mail('h1@x.com'), mail('h2@x.com'), mail('h3@x.com'),
    ];
    const { bosses, horde } = splitInbox(mails);
    const r = new Raid(bosses, horde);
    r.hitBoss('unsubscribe');
    r.hitBoss('spare');
    r.hitMail('archive');
    r.hitMail('star');
    r.hitMail('trash');
    expect(r.phase).toBe('done');
    while (r.canUndo) {
      const peeked = r.peekUndo();
      expect(r.undo()).toBe(peeked);
    }
    expect(r.phase).toBe('boss');
    expect(r.bossIdx).toBe(0);
    expect(r.inboxLeft).toBe(10);
    expect(r.score).toBe(0);
    expect(r.quests).toHaveLength(0);
    expect(bosses.every((b) => b.status === 'alive')).toBe(true);
  });

  it('a frozen tab adds at most 100ms of stress per tick', () => {
    const r = new Raid([], [mail('p@x.com')]);
    // Pretend the player has been idle long past the grace period.
    (r as unknown as { idleSince: number }).idleSince = performance.now() - 60_000;
    r.tick(8000);
    expect(r.stress).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it('gives the deliberate triage board a longer combo window', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    try {
      const r = new Raid([], [mail('a@x.com'), mail('b@x.com')], 0, 4000);
      r.hitMail('archive');
      clock.mockReturnValue(13_500);
      expect(r.hitMail('archive')!.combo).toBe(2);

      clock.mockReturnValue(20_000);
      const classic = new Raid([], [mail('c@x.com'), mail('d@x.com')]);
      classic.hitMail('archive');
      clock.mockReturnValue(23_500);
      expect(classic.hitMail('archive')!.combo).toBe(1);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('Raid.unsubFailed', () => {
  it('counts a boss whose unsubscribe did not go out as archived', () => {
    const { bosses, horde } = splitInbox([mail('x@x.com'), mail('x@x.com'), mail('x@x.com')]);
    const r = new Raid(bosses, horde);
    const hit = r.hitBoss('unsubscribe')!;
    expect(r.stats.unsubscribed).toBe(1);
    r.unsubFailed(hit);
    expect(r.stats.unsubscribed).toBe(0);
    expect(bosses[0].status).toBe('archived');
  });
});

describe('Raid triage board', () => {
  it('hits any card in the queue; undo puts it back at the front', () => {
    const a = mail('a@x.com'), b = mail('b@x.com'), c = mail('c@x.com');
    const r = new Raid([], [a, b, c]);
    const hit = r.hitMail('trash', c.id)!;
    expect(hit.mail).toBe(c);
    expect(r.mail).toBe(a);
    expect(r.horde.slice(r.hordeIdx)).toEqual([a, b]);
    r.undo();
    expect(r.mail).toBe(c);
    expect(r.inboxLeft).toBe(3);
  });

  it('ignores a card that is already gone', () => {
    const a = mail('a@x.com'), b = mail('b@x.com');
    const r = new Raid([], [a, b]);
    r.hitMail('archive', a.id);
    expect(r.hitMail('archive', a.id)).toBeNull();
    expect(r.inboxLeft).toBe(1);
  });

  it('draft points survive an undo of an earlier hit', () => {
    const a = mail('a@x.com'), b = mail('b@x.com');
    const r = new Raid([], [a, b]);
    r.hitMail('star', a.id);
    const before = r.score;
    r.bonus(300);
    expect(r.score).toBe(before + 300);
    r.undo();
    expect(r.score).toBe(300);
    expect(r.stats.drafts).toBe(1);
  });
});
