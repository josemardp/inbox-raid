/** Mail data can come from a real inbox: always escape before innerHTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A black bar about as long as the text. The text itself never reaches the page. */
export function redact(text: string): string {
  return `<span class="redact" aria-label="hidden">${'x'.repeat(Math.max(4, Math.min(text.length, 28)))}</span>`;
}
