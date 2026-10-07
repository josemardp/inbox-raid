// Triage board drag and drop. Pure DOM: the game decides what a drop means.

const DRAG_START_PX = 6;

export interface DragHandlers {
  /** The card was dropped on a zone (its data-zone). */
  drop(zone: string, card: HTMLElement): void;
  /** A tap or click without dragging: select the card. */
  tap(card: HTMLElement): void;
  /** Whether a drag may start right now (the game may be busy). */
  canDrag(): boolean;
}

function zoneAt(x: number, y: number, zones: HTMLElement[]): HTMLElement | null {
  return zones.find((z) => {
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) ?? null;
}

/**
 * Makes every `.mini-card` in `queue` draggable onto the `[data-zone]` elements.
 * The card itself stays in the queue (dimmed); a ghost copy follows the pointer,
 * so the queue panel can clip its overflow without clipping the drag.
 */
export function bindBoard(queue: HTMLElement, zones: HTMLElement[], h: DragHandlers) {
  queue.querySelectorAll<HTMLElement>('.mini-card').forEach((card) => {
    let x0 = 0, y0 = 0, lastX = 0, dragging = false, down = false;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let offX = 0, offY = 0;

    const place = (x: number, y: number) => {
      if (!ghost) return;
      const tilt = Math.max(-14, Math.min(14, (x - lastX) * 0.9));
      lastX = x;
      ghost.style.transform = `translate(${x - offX}px, ${y - offY}px) rotate(${tilt}deg) scale(1.04)`;
    };

    const end = () => {
      down = false;
      dragging = false;
      over?.classList.remove('hover');
      over = null;
      document.body.classList.remove('dragging');
    };

    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !h.canDrag()) return;
      down = true;
      x0 = lastX = e.clientX;
      y0 = e.clientY;
      card.setPointerCapture(e.pointerId);
    });

    card.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < DRAG_START_PX) return;
        if (!h.canDrag()) return end();
        dragging = true;
        const r = card.getBoundingClientRect();
        offX = x0 - r.left;
        offY = y0 - r.top;
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add('ghost');
        ghost.style.width = `${r.width}px`;
        // Canvas pixels are not cloned: copy the monster over.
        const src = card.querySelector('canvas');
        const dst = ghost.querySelector('canvas');
        if (src && dst) dst.getContext('2d')?.drawImage(src, 0, 0);
        document.body.append(ghost);
        card.classList.add('lifted');
        document.body.classList.add('dragging');
      }
      place(e.clientX, e.clientY);
      const z = zoneAt(e.clientX, e.clientY, zones);
      if (z !== over) {
        over?.classList.remove('hover');
        z?.classList.add('hover');
        over = z;
      }
    });

    const release = (e: PointerEvent, cancelled: boolean) => {
      if (!down) return;
      const wasDragging = dragging;
      const target = cancelled ? null : zoneAt(e.clientX, e.clientY, zones);
      end();
      if (!wasDragging) {
        if (!cancelled) h.tap(card);
        return;
      }
      const g = ghost!;
      ghost = null;
      if (target) {
        // Sucked into the zone.
        const r = target.getBoundingClientRect();
        g.classList.add('sucked');
        g.style.transform = `translate(${r.left + r.width / 2 - g.offsetWidth / 2}px, ${r.top + r.height / 2 - g.offsetHeight / 2}px) scale(.15) rotate(18deg)`;
        setTimeout(() => g.remove(), 260);
        target.classList.add('gulp');
        setTimeout(() => target.classList.remove('gulp'), 360);
        h.drop(target.dataset.zone!, card);
      } else {
        // Back to its place in the queue.
        const r = card.getBoundingClientRect();
        g.classList.add('return');
        g.style.transform = `translate(${r.left}px, ${r.top}px)`;
        setTimeout(() => { g.remove(); card.classList.remove('lifted'); }, 220);
      }
    };
    card.addEventListener('pointerup', (e) => release(e, false));
    card.addEventListener('pointercancel', (e) => release(e, true));
  });
}
