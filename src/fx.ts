// Juice: pixel particles, screen shake, floating score text, flashes.

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let shakeEl: HTMLElement;
const parts: Particle[] = [];
let shakeUntil = 0;
let shakePower = 0;
let running = false;

export function initFx(c: HTMLCanvasElement, shakeTarget: HTMLElement) {
  canvas = c;
  ctx = c.getContext('2d')!;
  shakeEl = shakeTarget;
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  resize();
  addEventListener('resize', resize);
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function burst(x: number, y: number, color: string, count = 24, speed = 6, size = 6) {
  const n = reduceMotion ? Math.ceil(count / 4) : count;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 40 + Math.random() * 30, size: size * (0.5 + Math.random()), color });
  }
  loop();
}

/** Lets a big kill finish without veiling the next decision screen. */
export function settleParticles(frames = 10) {
  for (const p of parts) p.max = Math.min(p.max, p.life + frames);
}

/** Centre of an element, in CSS pixels. */
export function centreOf(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

export function shake(power = 8, ms = 250) {
  if (reduceMotion) return;
  shakePower = Math.max(shakePower, power);
  shakeUntil = Math.max(shakeUntil, performance.now() + ms);
  loop();
}

export function floatText(x: number, y: number, text: string, color = '#ffd23f', size = 18) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  el.style.fontSize = `${size}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function flash(color = '#fff') {
  const el = document.createElement('div');
  el.className = 'flash';
  el.style.background = color;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function stamp(text: string, color: string) {
  const el = document.createElement('div');
  el.className = 'stamp';
  el.textContent = text;
  el.style.color = color;
  el.style.borderColor = color;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function loop() {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}

function frame() {
  const dpr = devicePixelRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life++;
    p.vy += 0.25;
    p.vx *= 0.98;
    p.x += p.vx;
    p.y += p.vy;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.color;
    const s = Math.round(p.size * dpr);
    ctx.fillRect(Math.round(p.x * dpr), Math.round(p.y * dpr), s, s);
  }
  ctx.globalAlpha = 1;

  const now = performance.now();
  if (now < shakeUntil) {
    const k = (shakeUntil - now) / 250;
    const dx = (Math.random() - 0.5) * shakePower * Math.min(1, k);
    const dy = (Math.random() - 0.5) * shakePower * Math.min(1, k);
    shakeEl.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (shakePower) {
    shakeEl.style.transform = '';
    shakePower = 0;
  }

  if (parts.length || now < shakeUntil) requestAnimationFrame(frame);
  else running = false;
}
