import { buildDemoInbox } from './demoInbox';
import type { ActionKind, InboxSource, Mail, UnsubPlan, UnsubResult } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fake inbox: same game, no login, nothing real is touched. */
export class DemoSource implements InboxSource {
  readonly label = 'DEMO INBOX';
  readonly isDemo = true;
  readonly inboxUrl = '';
  inboxTotal = 0;

  async load(onProgress: (loaded: number, total: number) => void): Promise<Mail[]> {
    const mails = buildDemoInbox();
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
    return { ok: true, method: 'demo' };
  }
  async undo(_kind: ActionKind, _ids: string[]) {}
}
