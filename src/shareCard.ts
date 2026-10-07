import { fmt, t } from './i18n';
import type { Raid } from './raid';
import { colorFor, drawMonster } from './sprites';

// The brag card: a 1200x630 image of the raid result, safe to post anywhere.
// It shows numbers and monsters only, never a subject, sender name or address.

const W = 1200;
const H = 630;
const FONT = '"Space Grotesk", sans-serif';
const MONO = '"DM Mono", monospace';
const SITE = 'josemardp.github.io/inbox-raid';
const C = { void: '#0a1024', navy: '#111d3c', panel: '#eef3fa', ink: '#0d1830', muted: '#5b6884', light: '#c7d2e6', blue: '#1f8bff', cyan: '#5fd3ec', coral: '#ff6e67', tile: '#dce5f2' };

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** A panel with the two cut corners used across the game. */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, cut = 22) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
  ctx.fill();
}

export async function renderShareCard(r: Raid, isDemo: boolean): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`500 16px ${MONO}`)]);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.2, H * 0.25, 0, W * 0.2, H * 0.25, W * 0.5);
  glow.addColorStop(0, '#1f8bff33');
  glow.addColorStop(1, '#1f8bff00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Left: the radar with the result.
  const L = { x: 36, y: 36, w: 500, h: H - 72 };
  panel(ctx, L.x, L.y, L.w, L.h, C.navy, 34);
  const cx = L.x + L.w / 2, cy = L.y + 250;
  ctx.lineWidth = 2;
  for (const [rad, col] of [[210, '#5fd3ec55'], [150, '#1f8bffaa']] as const) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 180, -1.9, -0.2);
  ctx.stroke();
  text(ctx, isDemo ? t('card.demo') : t('card.real'), L.x + 30, L.y + 46, `500 16px ${MONO}`, C.cyan);
  const zero = r.inboxLeft === 0;
  text(ctx, zero ? t('clear.zero') : t('clear.stage'), cx, cy - 30, `700 56px ${FONT}`, '#ffffff', 'center');
  text(ctx, `${fmt(r.inboxStart)}  →  ${fmt(r.inboxLeft)}`, cx, cy + 50, `700 54px ${FONT}`, C.cyan, 'center');

  // The bosses that went down, as a trophy row of lights.
  const fallen = r.bosses.filter((b) => b.status !== 'alive' && b.status !== 'spared').slice(0, 6);
  const sprite = document.createElement('canvas');
  const size = 56;
  const rowW = fallen.length * (size + 14) - 14;
  fallen.forEach((b, i) => {
    drawMonster(sprite, b.key, 11, 9, 0, colorFor(b.key), 12);
    const x = cx - rowW / 2 + i * (size + 14);
    ctx.drawImage(sprite, x, L.y + L.h - 96, size, size * 9 / 11);
    if (b.status === 'unsubscribed') {
      ctx.strokeStyle = C.coral;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 6, L.y + L.h - 102, size + 12, size * 9 / 11 + 12);
    }
  });

  // Right: the ceramic report.
  const R = { x: 556, y: 36, w: W - 592, h: H - 72 };
  panel(ctx, R.x, R.y, R.w, R.h, C.panel);
  text(ctx, 'INBOX', R.x + 34, R.y + 82, `700 56px ${FONT}`, C.ink);
  ctx.font = `700 56px ${FONT}`;
  text(ctx, 'RAID', R.x + 34 + ctx.measureText('INBOX ').width, R.y + 82, `700 56px ${FONT}`, C.blue);
  const cleared = r.stats.archived + r.stats.trashed + r.stats.starred;
  const stats: [string, string][] = [
    [t('card.cleared'), fmt(cleared)],
    [t('card.bosses'), `${r.stats.bossesDown}/${r.bosses.length}`],
    [t('card.unsubs'), String(r.stats.unsubscribed)],
    [t('card.combo'), `x${r.stats.maxCombo}`],
    [t('card.time'), clock(r.elapsedMs)],
    [t('card.score'), fmt(r.score)],
  ];
  const colW = (R.w - 68 - 16) / 3;
  stats.forEach(([label, value], i) => {
    const x = R.x + 34 + (i % 3) * (colW + 8);
    const y = R.y + 130 + Math.floor(i / 3) * 128;
    ctx.fillStyle = C.tile;
    ctx.fillRect(x, y, colW, 118);
    text(ctx, label, x + 18, y + 36, `500 15px ${MONO}`, C.muted);
    text(ctx, value, x + 18, y + 92, `700 44px ${FONT}`, i === 5 ? C.blue : C.ink);
  });
  text(ctx, SITE, R.x + 34, R.y + R.h - 34, `500 18px ${MONO}`, C.blue);
  return c;
}

/** Shares the card where the device can (phones), otherwise downloads it. */
export async function shareCard(canvas: HTMLCanvasElement): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No image'))), 'image/png'));
  const file = new File([blob], 'inbox-raid.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: 'Inbox Raid', text: `I raided my inbox. ${SITE}` });
      return 'shared';
    } catch (err) {
      // The player closed the share sheet: respect that, no surprise download.
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inbox-raid.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'saved';
}
