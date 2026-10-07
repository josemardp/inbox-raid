// Screenshots of every screen at desktop and phone sizes, for visual QA of a build.
//   node tools/video/qa-shots.mjs <url> <out dir> [lang]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const [url, out, lang = 'en'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sizes = [['desk', 1280, 720, 1.5], ['phone', 390, 844, 2], ['small', 360, 640, 2]];
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, w, h, dsf] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: w < 700 });
  await ctx.addInitScript((l) => { localStorage.setItem('inbox-raid-lang', l); localStorage.setItem('inbox-raid-privacy', '0'); }, lang);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const over = async (tag) => { const o = await p.evaluate(() => [document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]); console.log(name, tag, 'overflow y/x', o.join('/')); };
  const shot = async (tag) => { await over(tag); await p.screenshot({ path: `${out}/${name}-${tag}.png` }); };
  await shot('1-title');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.brief.scan');
  await p.waitForTimeout(150);
  await shot('2-scan');
  await p.waitForSelector('.brief.boss', { timeout: 20000 });
  await p.waitForTimeout(700);
  await shot('3-boss');
  await p.keyboard.press('u');
  await p.waitForTimeout(420);
  await shot('4-hit');
  for (let i = 0; i < 30; i++) {
    if (await p.$('.card.live')) break;
    await p.waitForTimeout(450);
    await p.keyboard.press('a');
  }
  await p.waitForSelector('.card.live');
  await p.waitForTimeout(500);
  await shot('5-horde');
  for (let i = 0; i < 80; i++) {
    if (await p.$('.report')) break;
    await p.keyboard.press(['ArrowLeft', 'ArrowDown', 'ArrowRight'][i % 3]);
    await p.waitForTimeout(260);
  }
  await p.waitForSelector('.report');
  await p.waitForTimeout(1200);
  await shot('6-clear');
  console.log(name, 'errors:', errors.length ? errors.join(' | ') : 'none');
  await ctx.close();
}
await b.close();
