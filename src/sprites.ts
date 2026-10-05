// Every sender gets its own pixel monster, generated from its address.
// Same sender, same monster, every time.

export const PALETTE = ['#ff2e88', '#29e7ff', '#ffd23f', '#3cff7a', '#b06bff', '#ff8a3d'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rand(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function colorFor(key: string): string {
  return PALETTE[hash(key) % PALETTE.length];
}

/** Two animation frames of a mirrored invader, as boolean grids. */
function grids(key: string, w: number, h: number): boolean[][][] {
  const r = rand(hash(key));
  const half = Math.ceil(w / 2);
  const base: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < half; x++) {
      // Denser toward the middle, so it reads as a body, not noise.
      const centre = x / (half - 1);
      row.push(r() < 0.25 + 0.5 * centre);
    }
    for (let x = half - (w % 2 ? 2 : 1); x >= 0; x--) row.push(row[x]);
    base.push(row);
  }
  // Solid core and two eyes.
  const cx = Math.floor(w / 2), eyeY = Math.floor(h * 0.35), ex = Math.max(1, Math.floor(w / 4));
  for (let y = 1; y < h - 1; y++) base[y][cx] = true;
  for (let x = cx - ex - 1; x <= cx + ex + 1; x++) base[eyeY][x] = true;
  base[eyeY][cx - ex] = false;
  base[eyeY][cx + ex] = false;
  // Legs: alternate columns on the last row, swapped between the two frames.
  const last = h - 1;
  const alt = base.map((row) => [...row]);
  for (let x = 0; x < w; x++) {
    const outer = Math.min(x, w - 1 - x) % 2 === 0;
    base[last][x] = outer;
    alt[last][x] = !outer;
  }
  base[last][cx] = alt[last][cx] = false;
  return [base, alt];
}

/** Draws a monster on a canvas sized w x h logical pixels. CSS scales it up crisp. */
export function drawMonster(canvas: HTMLCanvasElement, key: string, w = 11, h = 9, frame = 0, color = colorFor(key)) {
  const g = grids(key, w, h)[frame % 2];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x]) ctx.fillRect(x, y, 1, 1);
}
