import type { Raid } from './raid';
import { colorFor, drawMonster } from './sprites';

// The brag card: a 1200x630 image of the raid result, safe to post anywhere.
// It shows numbers and monsters only, never a subject, sender name or address.

const W = 1200;
const H = 630;
const FONT = '"Press Start 2P", monospace';
const SITE = 'josemardp.github.io/inbox-raid';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', shadow = 0) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.fillStyle = '#000';
    ctx.fillText(s, x + shadow, y + shadow);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export async function renderShareCard(r: Raid, isDemo: boolean): Promise<HTMLCanvasElement> {
  await document.fonts.load(`20px ${FONT}`);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Background: night grid with a purple glow at the bottom.
  ctx.fillStyle = '#0b0b1e';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 1.2, 0, W / 2, H * 1.2, W * 0.7);
  glow.addColorStop(0, '#2a1450');
  glow.addColorStop(1, '#0b0b1e00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff0a';
  for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 1);

  // Frame.
  ctx.strokeStyle = '#29e7ff';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  text(ctx, 'INBOX', 60, 92, 30, '#29e7ff', 'left', 4);
  text(ctx, 'RAID', 236, 92, 30, '#ff2e88', 'left', 4);
  text(ctx, isDemo ? 'DEMO RAID' : 'REAL INBOX', W - 60, 88, 16, isDemo ? '#8a8fc0' : '#3cff7a', 'right');

  const zero = r.inboxLeft === 0;
  text(ctx, zero ? 'INBOX ZERO' : 'STAGE CLEAR', W / 2, 200, 64, '#ffd23f', 'center', 6);

  // Before -> after, centred as one group whatever the widths of the two numbers.
  const from = fmt(r.inboxStart);
  const to = fmt(r.inboxLeft);
  const gap = 60;
  ctx.font = `52px ${FONT}`;
  const wFrom = ctx.measureText(from).width;
  const x0 = W / 2 - (wFrom + gap * 2 + ctx.measureText(to).width) / 2;
  text(ctx, from, x0, 300, 52, '#ff2e88', 'left', 4);
  text(ctx, '>', x0 + wFrom + gap, 296, 36, '#8a8fc0', 'center');
  text(ctx, to, x0 + wFrom + gap * 2, 300, 52, '#3cff7a', 'left', 4);

  // Stats row.
  const cleared = r.stats.archived + r.stats.trashed + r.stats.starred;
  const stats: [string, string][] = [
    ['CLEARED', fmt(cleared)],
    ['BOSSES', `${r.stats.bossesDown}/${r.bosses.length}`],
    ['UNSUBS', String(r.stats.unsubscribed)],
    ['COMBO', `x${r.stats.maxCombo}`],
    ['TIME', clock(r.elapsedMs)],
  ];
  const colW = (W - 120) / stats.length;
  stats.forEach(([label, value], i) => {
    const cx = 60 + colW * i + colW / 2;
    ctx.strokeStyle = '#2c2c5a';
    ctx.lineWidth = 4;
    ctx.strokeRect(60 + colW * i + 6, 340, colW - 12, 96);
    text(ctx, label, cx, 374, 12, '#8a8fc0', 'center');
    text(ctx, value, cx, 418, 24, '#ffd23f', 'center');
  });

  // The bosses that went down, as a trophy row.
  const fallen = r.bosses.filter((b) => b.status !== 'alive' && b.status !== 'spared').slice(0, 10);
  const sprite = document.createElement('canvas');
  const size = 66;
  const rowW = fallen.length * (size + 18) - 18;
  fallen.forEach((b, i) => {
    drawMonster(sprite, b.key, 11, 9, 0, colorFor(b.key));
    const x = W / 2 - rowW / 2 + i * (size + 18);
    ctx.drawImage(sprite, x, 462, size, size * 9 / 11);
    if (b.status === 'unsubscribed') {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 6, 456, size + 12, size * 9 / 11 + 12);
    }
  });

  text(ctx, `SCORE ${fmt(r.score)}`, 60, H - 52, 18, '#e8e8ff');
  text(ctx, SITE, W - 60, H - 52, 16, '#29e7ff', 'right');
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
