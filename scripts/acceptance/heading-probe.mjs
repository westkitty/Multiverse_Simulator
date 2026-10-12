/**
 * Heading-sweep frame probe: samples frame intervals at 8 camera headings and
 * records draw calls per heading, so baseline/candidate can be compared at
 * matched visual workloads. Software SwiftShader — NOT hardware certification.
 * Usage: CHROMIUM_EXECUTABLE=/tmp/chromium node scripts/acceptance/heading-probe.mjs <baseURL> <label>
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
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.waitForTimeout(1500);

const rows = [];
for (let heading = 0; heading < 8; heading++) {
  await page.waitForTimeout(1100); // allow diagnostics dataset sample
  const drawCalls = Number(await canvas.evaluate(el => el.dataset.drawCalls ?? 0));
  const p50 = await canvas.evaluate(async () => {
    const intervals = [];
    let last = performance.now();
    await new Promise(resolve => {
      const tick = (t) => {
        intervals.push(t - last); last = t;
        if (intervals.length < 80) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    intervals.shift();
    const sorted = intervals.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });
  rows.push({ heading: heading * 45, drawCalls, p50: Math.round(p50 * 10) / 10 });
  // rotate 45 degrees: yaw sensitivity 0.004 rad/px → 45° = 0.7854/0.004 ≈ 196px
  for (let seg = 0; seg < 2; seg++) {
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(60);
  }
}
console.log(JSON.stringify({ label, rows }, null, 1));
await browser.close();
