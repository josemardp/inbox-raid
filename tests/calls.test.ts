import { describe, expect, it } from 'vitest';
import { judgeCall, mailKind } from '../src/calls';
import { buildDemoInbox } from '../src/demoInbox';
import { Raid, SHARP_BONUS, splitInbox } from '../src/raid';
import type { Mail } from '../src/types';

const mail = (fromName: string, fromEmail: string, subject: string, snippet = ''): Mail =>
  ({ id: fromEmail + subject, fromName, fromEmail, subject, snippet, date: 0 });

const scam = mail('Accounts Dept', 'invoice@totally-legit.example', 'RE: RE: RE: your invoice', 'Open the attached invoice.zip.exe immediately.');
const bill = mail('PowerCo', 'billing@powerco.example', 'Your bill is due in 3 days', 'Amount due: more than last month.');
const neighbour = mail('Neighbor Tom', 'tom@street.example', 'Is this your cat?', 'It has been sitting on my car for 3 hours.');
const newsletter = mail('Unknown Community', 'welcome@unknown.example', 'Welcome to the community!', 'Thanks for joining!');

describe('judgeCall', () => {
  it('a scam belongs in the trash', () => {
    expect(judgeCall(scam, 'trash')).toBe('sharp');
    expect(judgeCall(scam, 'archive')).toBe('fair');
  });

  it('a bill or a person asking something needs the player', () => {
    expect(judgeCall(bill, 'star')).toBe('sharp');
    expect(judgeCall(bill, 'archive')).toBe('missed');
    expect(judgeCall(neighbour, 'trash')).toBe('missed');
    expect(judgeCall(neighbour, 'star')).toBe('sharp');
  });

  it('a newsletter just leaves', () => {
    expect(judgeCall(newsletter, 'archive')).toBe('sharp');
    expect(judgeCall(newsletter, 'trash')).toBe('sharp');
    expect(judgeCall(newsletter, 'star')).toBe('fair');
  });

  it('a mailing list invitation is not a missed meeting', () => {
    const webinar = { ...mail('Acme Webinars', 'events@acme.example', 'Invitation: join our live webinar'), listUnsubscribe: '<https://acme.example/u>' };
    expect(judgeCall(webinar, 'archive')).toBe('sharp');
  });

  it('the quick demo has a fair mix of calls', () => {
    const { horde } = splitInbox(buildDemoInbox(Date.now(), 'blitz'));
    const kinds = horde.map(mailKind);
    expect(kinds).toContain('scam');
    expect(kinds).toContain('bill');
    expect(kinds.filter((k) => k === 'info').length).toBeGreaterThan(0);
  });
});

describe('raid scoring of calls', () => {
  it('a sharp call earns the bonus, a missed one is remembered and undone cleanly', () => {
    const r = new Raid([], [bill, newsletter]);
    const sharp = r.hitMail('archive', newsletter.id, judgeCall(newsletter, 'archive'))!;
    expect(sharp.points).toBe((100 + SHARP_BONUS) * sharp.combo);
    r.hitMail('archive', bill.id, judgeCall(bill, 'archive'));
    expect(r.missed).toEqual([bill]);
    expect(r.stats).toMatchObject({ calls: 2, sharp: 1 });
    expect(r.eagleEye).toBe(false);
    r.undo();
    expect(r.missed).toEqual([]);
    expect(r.stats).toMatchObject({ calls: 1, sharp: 1 });
  });

  it('Eagle Eye needs enough calls and none missed', () => {
    const news = Array.from({ length: 5 }, (_, i) => mail('News', 'news@shop.example', `Deal ${i}`));
    const r = new Raid([], news);
    news.forEach((m) => r.hitMail('archive', m.id, judgeCall(m, 'archive')));
    expect(r.phase).toBe('done');
    expect(r.eagleEye).toBe(true);
  });
});
