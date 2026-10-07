import type { Mail } from './types';

export type SenderKind = 'person' | 'organization' | 'automated' | 'unknown';

export interface SenderAssessment {
  kind: SenderKind;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

const PERSONAL_DOMAINS = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|uol|bol|terra|ig|zipmail|gmx)\./i;
const FUNCTIONAL_LOCAL = /^(?:no-?reply|noreply|notifications?|tracking|billing|statements?|feedback|results?|firmware|progress|survey|calendar|security|alerts?|office|info|contact|contato|support|suporte|hello|team|admin|news|newsletter|atendimento|secretaria|invoice|tickets?|jobs?|hr|it|live|welcome|firmware)\b/i;
const ORGANIZATION_WORDS = /(?:^|\s)(?:school|office|team|department|dept|clinic|bank|support|service|services|community|calendar|webinars?|inc|ltd|llc|store|shop|news|dental|gym|parking|billing|accounts?|parcel|air|power|crypto|mart|escola|prefeitura|secretaria|equipe|banco|cl[íi]nica|loja|suporte|atendimento|departamento|ltda)(?:\s|$)/i;

export function isFunctionalAddress(email: string): boolean {
  return FUNCTIONAL_LOCAL.test(email.split('@')[0] ?? '');
}

export function looksOrganizationalName(name: string): boolean {
  return ORGANIZATION_WORDS.test(name.replace(/[()]/g, ' '));
}

function looksHumanName(name: string): boolean {
  const clean = name.replace(/\([^)]*\)|"[^"]*"|<[^>]*>/g, '').trim();
  if (!clean || /\d|@/.test(clean) || looksOrganizationalName(clean)) return false;
  const parts = clean.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((p) => /^[\p{Lu}][\p{Ll}'-]+$/u.test(p));
}

/**
 * Conservative sender assessment. Unknown senders are not treated as people: a generic
 * personal reply is more harmful than an informational briefing when confidence is low.
 */
export function assessSender(m: Pick<Mail, 'fromName' | 'fromEmail' | 'listUnsubscribe'>): SenderAssessment {
  let score = 0;
  const reasons: string[] = [];
  if (m.listUnsubscribe) { score -= 6; reasons.push('unsubscribe'); }
  if (isFunctionalAddress(m.fromEmail)) { score -= 4; reasons.push('functional-address'); }
  if (looksOrganizationalName(m.fromName)) { score -= 3; reasons.push('organization-name'); }
  if (PERSONAL_DOMAINS.test(m.fromEmail)) { score += 3; reasons.push('personal-domain'); }
  if (/\svia\s/i.test(m.fromName) || /@googlegroups\.com$/i.test(m.fromEmail)) {
    score += 3;
    reasons.push('group-person');
  }
  if (looksHumanName(m.fromName)) { score += 2; reasons.push('human-name'); }

  if (score >= 2) return { kind: 'person', confidence: score >= 4 ? 'high' : 'medium', reasons };
  if (score <= -4) return { kind: 'automated', confidence: score <= -6 ? 'high' : 'medium', reasons };
  if (score < 0) return { kind: 'organization', confidence: 'medium', reasons };
  return { kind: 'unknown', confidence: 'low', reasons };
}

export const isPerson = (m: Pick<Mail, 'fromName' | 'fromEmail' | 'listUnsubscribe'>) => assessSender(m).kind === 'person';
