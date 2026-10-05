export interface Mail {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: number; // epoch ms
  /** Raw List-Unsubscribe header, when the sender provides one. */
  listUnsubscribe?: string;
  /** True when List-Unsubscribe-Post says one-click is supported (RFC 8058). */
  oneClickUnsub?: boolean;
}

export type ActionKind = 'archive' | 'trash' | 'star' | 'unsubscribe';

export interface UnsubResult {
  ok: boolean;
  /** How it was done, shown to the player. */
  method: 'one-click' | 'mailto' | 'link' | 'none' | 'demo';
}

/** Where the emails come from and where actions really happen. */
export interface InboxSource {
  readonly label: string;
  readonly isDemo: boolean;
  load(onProgress: (loaded: number) => void): Promise<Mail[]>;
  archive(ids: string[]): Promise<void>;
  trash(ids: string[]): Promise<void>;
  /** Quest: star it and take it out of the inbox, so it waits in Starred. */
  star(ids: string[]): Promise<void>;
  unsubscribe(sample: Mail): Promise<UnsubResult>;
  /** Puts emails back in the inbox exactly as before the action. */
  undo(kind: ActionKind, ids: string[]): Promise<void>;
}
