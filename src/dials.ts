// Car-cluster dials: a 270 degree sweep with ticks, a value arc and, for stress,
// a red zone and a needle. Built once; update() only moves the arc, needle and text.

const NS = 'http://www.w3.org/2000/svg';
const C = 100;
const R = 86;
const A0 = 135;
const SWEEP = 270;

const pt = (deg: number, rad: number): [number, number] =>
  [C + rad * Math.cos((deg * Math.PI) / 180), C + rad * Math.sin((deg * Math.PI) / 180)];

function arc(from: number, to: number, rad: number): string {
  if (to - from < 0.01) return '';
  const [x1, y1] = pt(from, rad);
  const [x2, y2] = pt(to, rad);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${rad} ${rad} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function add<K extends keyof SVGElementTagNameMap>(svg: SVGSVGElement, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  svg.appendChild(el);
  return el;
}

export interface Dial {
  /** `needleAt` lets the needle read something livelier than the arc (it defaults to the arc). */
  update(fraction: number, big?: string, sub?: string, needleAt?: number): void;
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeDial(svg: SVGSVGElement, { ticks = 10, red = 0, needle = false, big = false } = {}): Dial {
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.textContent = '';
  add(svg, 'circle', { cx: C, cy: C, r: R + 10, class: 'dial-face' });
  add(svg, 'path', { d: arc(A0, A0 + SWEEP, R - 8), class: 'dial-track' });
  if (red) add(svg, 'path', { d: arc(A0 + SWEEP * red, A0 + SWEEP, R - 8), class: 'dial-red' });
  const value = add(svg, 'path', { d: '', class: 'dial-value' });
  for (let i = 0; i <= ticks; i++) {
    const d = A0 + (SWEEP * i) / ticks;
    const [x1, y1] = pt(d, R - 19);
    const [x2, y2] = pt(d, R - (i % 2 ? 24 : 29));
    add(svg, 'line', { x1, y1, x2, y2, class: i % 2 ? 'dial-tick' : 'dial-tick major' });
  }
  const hand = needle ? add(svg, 'line', { x1: C, y1: C, x2: C, y2: C, class: 'dial-needle' }) : null;
  if (needle) add(svg, 'circle', { cx: C, cy: C, r: 8, class: 'dial-hub' });
  const bigText = big ? add(svg, 'text', { x: C, y: C + 12, class: 'dial-big' }) : null;
  const subText = big ? add(svg, 'text', { x: C, y: C + 36, class: 'dial-sub' }) : null;
  let last = -1;
  // The needle is a damped spring with an engine tremor, like a rev counter: it swings to its
  // reading, overshoots a little and never sits dead still while the raid runs.
  let pos = 0;
  let vel = 0;
  let prev = performance.now();
  return {
    update(fraction, bigValue, subValue, needleAt = fraction) {
      const f = Math.max(0, Math.min(1, fraction));
      if (Math.abs(f - last) > 0.001) {
        last = f;
        value.setAttribute('d', arc(A0, A0 + SWEEP * f, R - 8));
        value.classList.toggle('hot', !!red && f >= red);
      }
      if (hand) {
        const now = performance.now();
        const dt = Math.min((now - prev) / 1000, 0.05);
        prev = now;
        const target = Math.max(0, Math.min(1, needleAt));
        if (still()) pos = target;
        else {
          vel += ((target - pos) * 160 - vel * 13) * dt;
          pos = Math.max(-0.02, Math.min(1.02, pos + vel * dt));
        }
        const shake = still() ? 0 : (0.5 + 3 * pos * pos) * (Math.sin(now / 21) + Math.sin(now / 13)) / 2;
        const [nx, ny] = pt(A0 + SWEEP * pos + shake, R - 26);
        hand.setAttribute('x2', nx.toFixed(2));
        hand.setAttribute('y2', ny.toFixed(2));
      }
      if (bigText && bigValue !== undefined && bigText.textContent !== bigValue) bigText.textContent = bigValue;
      if (subText && subValue !== undefined && subText.textContent !== subValue) subText.textContent = subValue;
    },
  };
}
