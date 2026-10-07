import { sfx } from './audio';
import { esc, redact } from './html';
import { t } from './i18n';
import { aiReady, aiReply, brief, calendarUrl, type Briefing, type Tone } from './suggest';
import { AuthExpiredError, type InboxSource, type Mail, type MailBody } from './types';

// The quest briefing: the whole email, what kind of quest it is, what to notice, and a
// reply to start from. The game only ever saves a draft; sending is the player's call.

export type BriefMove = 'archive' | 'trash' | 'star';

export interface BriefResult {
  /** What happens to the email (in a raid). null = the player went back. */
  move: BriefMove | null;
  drafted: boolean;
  authExpired?: boolean;
}

export interface BriefOptions {
  mail: Mail;
  source: InboxSource;
  /** The sender looks like a human, not a mailing list. */
  person: boolean;
  privacy: boolean;
  /** Mid-raid the briefing also decides the card's fate; after the raid it only writes drafts. */
  inRaid: boolean;
  toast: (text: string, ms?: number) => void;
}

let isOpen = false;
export const briefingOpen = () => isOpen;

const TONES: Tone[] = ['yes', 'later', 'no'];

export function openBriefing(o: BriefOptions): Promise<BriefResult> {
  isOpen = true;
  const { mail, privacy } = o;
  // One-off senders are too often people: in privacy mode the sender is always hidden.
  const hide = (s: string) => (privacy ? redact(s) : esc(s));
  const lastFocus = document.activeElement as HTMLElement | null;

  const root = document.createElement('div');
  root.className = 'overlay';
  root.innerHTML = `
    <section class="panel mission" role="dialog" aria-modal="true" aria-labelledby="brief-subject" tabindex="-1">
      <header class="mission-head">
        <p class="eyebrow">${t('brief.eyebrow')} <span class="kind" hidden></span></p>
        <h2 class="sender">${hide(mail.fromName)}</h2>
        <p class="email">${hide(mail.fromEmail)}</p>
        <h3 class="subject" id="brief-subject">${privacy ? redact(mail.subject) : esc(mail.subject || t('horde.nosubject'))}</h3>
      </header>
      <div class="mission-text"><p class="fulltext loading blink">${t('brief.loading')}</p></div>
      <div class="mission-side"></div>
      <footer class="mission-actions"></footer>
    </section>`;
  document.body.append(root);
  const panel = root.querySelector<HTMLElement>('.mission')!;
  panel.focus();
  sfx('select');

  return new Promise((resolve) => {
    let body: MailBody | null = null;
    let b: Briefing | null = null;
    let tone: Tone = 'yes';
    let working = false;

    const close = (r: BriefResult) => {
      if (!isOpen) return;
      isOpen = false;
      removeEventListener('keydown', onKey, true);
      root.remove();
      lastFocus?.focus?.();
      resolve(r);
    };

    const textarea = () => root.querySelector<HTMLTextAreaElement>('textarea');

    const recommended = (): string => {
      if (!b) return 'back';
      if (b.kind === 'scam') return o.inRaid ? 'trash' : 'back';
      if (b.kind === 'info') return o.inRaid ? 'archive' : 'back';
      if (b.replies.length) return 'draft';
      return o.inRaid ? 'star' : 'back';
    };

    const renderActions = () => {
      const rec = recommended();
      const btn = (key: string, label: string, action: string, cls = '') =>
        `<button class="btn ${cls} ${rec === action ? 'primary rec' : ''}" data-brief="${action}"><kbd>${key}</kbd><span>${label}${rec === action ? ` <small>${t('brief.suggested')}</small>` : ''}</span></button>`;
      const canDraft = !!b?.replies.length;
      const canCal = b?.kind === 'meeting' || b?.kind === 'confirm';
      root.querySelector('.mission-actions')!.innerHTML = `
        <div class="row brief-row">
          ${canDraft ? btn('S', o.inRaid ? t('brief.draftQuest') : t('brief.draft'), 'draft') : ''}
          ${o.inRaid ? btn('&rarr;', `${t('brief.quest')} &#9733;`, 'star', 'quest') : ''}
          ${o.inRaid ? btn('&larr;', t('brief.archive'), 'archive') : ''}
          ${o.inRaid ? btn('&darr;', t('brief.trash'), 'trash', 'danger') : ''}
          ${canCal ? btn('C', t('brief.calendar'), 'calendar', 'ghost') : ''}
          ${btn('ESC', t('brief.back'), 'back', 'ghost')}
        </div>
        <p class="fine">${o.source.isDemo ? `${t('brief.demo')} ` : ''}${t('brief.never')}</p>`;
    };

    const renderSide = async () => {
      if (!b || !body) return;
      const kind = root.querySelector<HTMLElement>('.kind')!;
      kind.hidden = false;
      kind.className = `kind k-${b.kind}`;
      kind.textContent = t(`kind.${b.kind}` as 'kind.info');
      const icon = { when: '&#9719;', money: '$', link: '&#8599;' };
      root.querySelector('.mission-side')!.innerHTML = `
        <p class="tip k-${b.kind}">${t(`tip.${b.kind}` as 'tip.info')}</p>
        ${b.intel.length && !privacy ? `
          <div class="intel"><p class="hp-label">${t('brief.intel')}</p>
          <ul>${b.intel.map((i) => `<li class="i-${i.kind}"><b>${icon[i.kind]}</b>${esc(i.text)}</li>`).join('')}</ul></div>` : ''}
        ${b.replies.length ? `
          <div class="reply">
            <p class="hp-label">${t('brief.reply')}</p>
            <div class="tones" role="radiogroup">${TONES.map((tn, i) => `<button class="tone ${tn === tone ? 'on' : ''}" role="radio" aria-checked="${tn === tone}" data-tone="${tn}"><kbd>${i + 1}</kbd>${t(`tone.${tn}`)}</button>`).join('')}</div>
            <textarea class="${privacy ? 'private' : ''}" rows="6" spellcheck="true" lang="${b.lang === 'pt' ? 'pt-BR' : 'en'}"></textarea>
            <button class="mini ai" data-brief="ai" hidden>&#10022; ${t('brief.ai')}</button>
          </div>` : ''}`;
      const ta = textarea();
      if (ta) ta.value = b.replies.find((r) => r.tone === tone)!.text;
      renderActions();
      if (b.replies.length && await aiReady(b.lang) && isOpen) {
        root.querySelector<HTMLElement>('.ai')?.removeAttribute('hidden');
      }
    };

    const setTone = (tn: Tone) => {
      if (!b?.replies.length || working) return;
      tone = tn;
      root.querySelectorAll<HTMLElement>('.tone').forEach((el) => {
        const on = el.dataset.tone === tn;
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', String(on));
      });
      textarea()!.value = b.replies.find((r) => r.tone === tn)!.text;
      sfx('tick');
    };

    const saveDraft = async () => {
      const ta = textarea();
      if (!b || !body || !ta || working || !ta.value.trim()) return;
      working = true;
      root.classList.add('working');
      try {
        await o.source.draft(mail, body, ta.value.trim());
        o.toast(o.source.isDemo ? t('toast.draftDemo') : t('toast.draft'), 3000);
        close({ move: o.inRaid ? 'star' : null, drafted: true });
      } catch (err) {
        console.error(err);
        if (err instanceof AuthExpiredError) return close({ move: null, drafted: false, authExpired: true });
        o.toast(t('toast.draftFail'), 3000);
      } finally {
        working = false;
        root.classList.remove('working');
      }
    };

    const polish = async () => {
      const ta = textarea();
      if (!b || !body || !ta || working) return;
      working = true;
      const btn = root.querySelector<HTMLButtonElement>('.ai')!;
      btn.disabled = true;
      btn.textContent = t('brief.aiWorking');
      ta.readOnly = true;
      try {
        ta.value = await aiReply(b, tone, mail.subject, body.text, ta.value);
      } catch (err) {
        console.warn(err);
        o.toast(t('brief.aiFail'), 3000);
      } finally {
        working = false;
        ta.readOnly = false;
        btn.disabled = false;
        btn.innerHTML = `&#10022; ${t('brief.ai')}`;
      }
    };

    const run = (action: string) => {
      if (working && action !== 'back') return;
      if (action === 'back') return close({ move: null, drafted: false });
      if (!b) return;
      if (action === 'draft') return void saveDraft();
      if (action === 'ai') return void polish();
      if (action === 'calendar') {
        window.open(calendarUrl(mail.subject, body?.text ?? ''), '_blank', 'noopener');
        return;
      }
      if (o.inRaid && (action === 'star' || action === 'archive' || action === 'trash')) close({ move: action, drafted: false });
    };

    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el === root) return run('back');
      const tn = el.closest<HTMLElement>('[data-tone]');
      if (tn) return setTone(tn.dataset.tone as Tone);
      const a = el.closest<HTMLButtonElement>('[data-brief]');
      if (a && !a.disabled) run(a.dataset.brief!);
    });

    // While the briefing is open it owns the keyboard; the raid underneath hears nothing.
    function onKey(e: KeyboardEvent) {
      e.stopImmediatePropagation();
      const typing = e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') { e.preventDefault(); return run('back'); }
      if (typing) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run('draft'); }
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement instanceof HTMLButtonElement) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const map: Record<string, string> = { s: 'draft', c: 'calendar', ArrowRight: 'star', ArrowLeft: 'archive', ArrowDown: 'trash', Enter: recommended() };
      if (k in map) { e.preventDefault(); return run(map[k]); }
      const n = Number(k);
      if (n >= 1 && n <= 3) setTone(TONES[n - 1]);
    }
    addEventListener('keydown', onKey, true);

    o.source.read(mail).then(
      (got) => {
        body = got;
        const textEl = root.querySelector<HTMLElement>('.fulltext')!;
        textEl.classList.remove('loading', 'blink');
        textEl.innerHTML = privacy
          ? got.text.split('\n').filter(Boolean).slice(0, 12).map((l) => redact(l)).join('<br>')
          : esc(got.text);
        b = brief(mail.subject, got.text, mail.fromName, o.person, mail.fromEmail);
        renderSide();
      },
      (err) => {
        console.error(err);
        if (!isOpen) return;
        if (err instanceof AuthExpiredError) return close({ move: null, drafted: false, authExpired: true });
        body = { text: mail.snippet, replyTo: mail.fromEmail, messageId: '', threadId: '' };
        const textEl = root.querySelector<HTMLElement>('.fulltext')!;
        textEl.classList.remove('loading', 'blink');
        textEl.innerHTML = `<em>${t('brief.readFail')}</em>\n\n${privacy ? redact(mail.snippet) : esc(mail.snippet)}`;
        b = brief(mail.subject, mail.snippet, mail.fromName, o.person, mail.fromEmail);
        renderSide();
      });
    renderActions();
  });
}
