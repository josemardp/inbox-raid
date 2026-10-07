import { describe, expect, it } from 'vitest';
import { assessSender, isPerson } from '../src/classifier';
import type { Mail } from '../src/types';

const mail = (fromName: string, fromEmail: string, listUnsubscribe?: string): Mail => ({
  id: fromEmail, fromName, fromEmail, subject: '', snippet: '', date: 0, listUnsubscribe,
});

describe('sender classifier', () => {
  it('keeps people as people', () => {
    expect(isPerson(mail('Mom', 'mom@family.example'))).toBe(true);
    expect(isPerson(mail('Alex (Old Friend)', 'alex@friends.example'))).toBe(true);
    expect(isPerson(mail('Neighbor Tom', 'tom@street.example'))).toBe(true);
    expect(isPerson(mail('Ana Souza', 'ana@gmail.com'))).toBe(true);
  });

  it('does not write personal replies to automated senders', () => {
    for (const [name, email] of [
      ['ParcelGo', 'tracking@parcelgo.example'],
      ['Bank of Somewhere', 'statements@bank.example'],
      ['City Clinic', 'results@clinic.example'],
      ['Calendar', 'calendar@work.example'],
      ['Accounts Dept', 'invoice@totally-legit.example'],
      ['IT Department', 'it@work.example'],
    ]) expect(isPerson(mail(name, email))).toBe(false);
  });

  it('treats unsubscribe senders as automated even when their name looks human', () => {
    const a = assessSender(mail('Alice Smith', 'alice@newsletter.example', '<https://newsletter.example/u>'));
    expect(a.kind).toBe('automated');
    expect(a.reasons).toContain('unsubscribe');
  });
});
