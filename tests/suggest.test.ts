import { describe, expect, it } from 'vitest';
import { brief, detectLang, findIntel, firstName } from '../src/suggest';

describe('brief', () => {
  it('flags a phishing email and suggests no reply', () => {
    const b = brief('RE: your invoice', 'Open the attached invoice.zip.exe immediately or your account will be suspended.', 'Accounts Dept', true);
    expect(b.kind).toBe('scam');
    expect(b.replies).toEqual([]);
  });

  it('a bill is paid, not answered', () => {
    const b = brief('Your bill is due in 3 days', 'Amount due: $148.20. Due date: the 15th.', 'PowerCo', true);
    expect(b.kind).toBe('bill');
    expect(b.replies).toEqual([]);
    expect(b.intel).toContainEqual({ kind: 'money', text: '$148.20' });
  });

  it('asks to confirm before calling it a meeting', () => {
    const b = brief('Parent-teacher meeting on Friday', 'The meeting is on Friday at 6pm. Please confirm your attendance.', 'Maple School', true);
    expect(b.kind).toBe('confirm');
    expect(b.replies.map((r) => r.tone)).toEqual(['yes', 'later', 'no']);
    expect(b.intel[0]).toEqual({ kind: 'when', text: 'Friday at 6pm' });
  });

  it('answers in the language of the email, with the sender first name', () => {
    const b = brief('Reunião de quinta', 'Olá, você pode participar da reunião na quinta às 14h? Obrigado', 'Ana Souza', true);
    expect(b.lang).toBe('pt');
    expect(b.kind).toBe('meeting');
    expect(b.replies[0].text.startsWith('Olá, Ana.')).toBe(true);
    expect(b.intel[0].text).toBe('quinta às 14h');
  });

  it('a mailing list is never a personal quest', () => {
    expect(brief('Can you guess?', 'Our weekly quiz is here?', 'The Daily Hustle', false).kind).toBe('info');
    expect(brief('Hey', 'How are you doing?', 'Alex', true).kind).toBe('question');
    expect(brief('Hey', 'Saw this and thought of you.', 'Alex', true).kind).toBe('personal');
  });
});

describe('helpers', () => {
  it('reads first names and skips brands and addresses', () => {
    expect(firstName('Karen (Your Boss)')).toBe('Karen');
    expect(firstName('"Doe, John"')).toBe('');
    expect(firstName('no-reply@x.com')).toBe('');
    expect(firstName('IT Department')).toBe('');
    expect(firstName('Maple School')).toBe('');
    expect(firstName('Ana Souza', 'office@school.example')).toBe('');
    expect(firstName('Élise Martin')).toBe('Élise');
  });

  it('tells Portuguese from English', () => {
    expect(detectLang('Bom dia, segue o documento. Obrigado')).toBe('pt');
    expect(detectLang('Hi, please find the document attached. Thanks')).toBe('en');
  });

  it('collects links as host names only', () => {
    expect(findIntel('Pay at https://pay.example.com/abc?x=1 today')).toEqual([
      { kind: 'when', text: 'today' },
      { kind: 'link', text: 'pay.example.com' },
    ]);
  });
});
