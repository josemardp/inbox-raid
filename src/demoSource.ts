import { buildDemoInbox, demoBody, type DemoPreset } from './demoInbox';
import type { ActionKind, InboxSource, Mail, MailBody, UnsubPlan, UnsubResult } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fake inbox: same game, no login, nothing real is touched. */
export class DemoSource implements InboxSource {
  readonly label = 'DEMO INBOX';
  readonly isDemo = true;
  readonly inboxUrl = '';
  inboxTotal = 0;

  constructor(readonly preset: DemoPreset = 'blitz') {}

  async load(onProgress: (loaded: number, total: number) => void): Promise<Mail[]> {
    const mails = buildDemoInbox(Date.now(), this.preset);
    this.inboxTotal = mails.length;
    // Fake a scan so the counter has something to do.
    for (let i = 0; i <= mails.length; i += 23) {
      onProgress(Math.min(i, mails.length), mails.length);
      await wait(30);
    }
    onProgress(mails.length, mails.length);
    return mails;
  }

  async archive(_ids: string[]) {}
  async trash(_ids: string[]) {}
  async star(_ids: string[]) {}
  async unsubscribe(_plan: UnsubPlan): Promise<UnsubResult> {
    return { ok: true, confirmed: true, method: 'demo' };
  }
  async undo(_kind: ActionKind, _ids: string[]) {}

  async read(mail: Mail): Promise<MailBody> {
    await wait(250);
    return { text: demoBody(mail), replyTo: mail.fromEmail, messageId: '', threadId: '' };
  }

  async draft(_mail: Mail, _body: MailBody, _text: string) {
    await wait(300);
  }
}
