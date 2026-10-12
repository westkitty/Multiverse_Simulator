/**
 * Matched frame-time and input-latency probe. Software SwiftShader WebGL —
 * NOT hardware GPU certification. Usage:
 * CHROMIUM_EXECUTABLE=/tmp/chromium node scripts/acceptance/frame-probe.mjs <baseURL> <label>
 */
import { chromium } from 'playwright-core';

const base = process.argv[2];
const label = process.argv[3] ?? 'run';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base + '#/explore');
await page.waitForSelector('[aria-label="Immersive 3D world explorer"] canvas', { timeout: 30000 });
const canvas = page.locator('[aria-label="Immersive 3D world explorer"] canvas');
await page.waitForTimeout(1200);

const sample = async (mode) => canvas.evaluate(async (el, label) => {
  const intervals = [];
  let last = performance.now();
  await new Promise(resolve => {
    const tick = (t) => {
      intervals.push(t - last);
      last = t;
      if (intervals.length < 240) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  intervals.shift();
  const sorted = intervals.slice().sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { mode: label, p50: pick(.5), p95: pick(.95), p99: pick(.99), mean: intervals.reduce((a, b) => a + b, 0) / intervals.length };
}, mode);

const idle = await sample('idle');
// Movement: hold W for the movement sample.
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.up();
await canvas.focus();
await page.keyboard.down('w');
const moving = await sample('moving');
await page.keyboard.up('w');
const drawCalls = await canvas.evaluate(el => el.dataset.drawCalls);
console.log(JSON.stringify({ label, drawCallsAtSpawn: Number(drawCalls), idle, moving }, null, 1));
await browser.close();
