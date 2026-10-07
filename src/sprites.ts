// Every sender gets its own monster, generated from its address.
// Same sender, same monster, every time. Drawn as a grid of lights.

export const PALETTE = ['#75dbf3', '#4aa3ff', '#ff6e67', '#9fe6ff', '#3fd0c9', '#b9c8ff'];
const CORAL = '#ff6e67';

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
  // Solid head around the eyes, so every monster has a face.
  const cx = Math.floor(w / 2), eyeY = Math.floor(h * 0.35), ex = Math.max(1, Math.floor(w / 4));
  for (let y = 1; y < h - 1; y++) base[y][cx] = true;
  for (let y = eyeY - 1; y <= eyeY + 2; y++)
    for (let x = cx - ex - 1; x <= cx + ex + 1; x++) base[y][x] = true;
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

/**
 * Draws a monster: one round light per cell of its grid, `cell` canvas pixels apart.
 * Coral eyes (white on a coral body) and a white mouth.
 */
export function drawMonster(canvas: HTMLCanvasElement, key: string, w = 11, h = 9, frame = 0, color = colorFor(key), cell = 12) {
  const g = grids(key, w, h)[frame % 2];
  canvas.width = w * cell;
  canvas.height = h * cell;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = Math.floor(w / 2), eyeY = Math.floor(h * 0.35), ex = Math.max(1, Math.floor(w / 4));
  const eye = color === CORAL ? '#ffffff' : CORAL;
  // Blink: on the second frame the eyes close to body colour.
  const blink = frame % 4 === 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y][x]) continue;
    let c = color;
    if (y === eyeY && (x === cx - ex || x === cx + ex) && !blink) c = eye;
    else if (y === eyeY + 2 && x > cx - ex && x < cx + ex) c = '#f5f8fc';
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
