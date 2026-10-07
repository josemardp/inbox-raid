import { describe, expect, it } from 'vitest';
import { Raid, splitInbox } from '../src/raid';
import type { Mail } from '../src/types';

let n = 0;
const mail = (fromEmail: string, extra: Partial<Mail> = {}): Mail => ({
  id: `m${n++}`, fromName: fromEmail, fromEmail, subject: 's', snippet: '', date: n, ...extra,
});

describe('splitInbox', () => {
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
