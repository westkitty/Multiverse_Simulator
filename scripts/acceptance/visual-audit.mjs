/**
 * Visual discovery audit: captures representative immersive-world screenshots
 * and WebGL instrumentation from the production build. Evidence only — never
 * asserts. Usage: CHROMIUM_EXECUTABLE=/tmp/chromium node scripts/acceptance/visual-audit.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const outDir = join(root, '.cache/audit');
mkdirSync(outDir, { recursive: true });
const base = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:4173/Multiverse_Simulator/';
const worlds = (process.env.AUDIT_WORLDS ?? 'A,B,D,E,F,G,K,L,O').split(',');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', error => console.log('PAGEERROR:', error.message));
await page.goto(base + '#/explore');
await page.waitForSelector('[aria-label="Immersive 3D world explorer"] canvas', { timeout: 30000 });
const switcher = page.getByRole('group', { name: 'Quick World Switcher' });

for (const letter of worlds) {
  await switcher.getByRole('button', { name: new RegExp('World ' + letter + ':') }).click();
  const canvas = page.locator('[aria-label="Immersive 3D world explorer"] canvas');
  await page.waitForTimeout(1800); // allow several rendered frames + diagnostics sample
  const info = await canvas.evaluate(el => ({
    drawCalls: el.dataset.drawCalls, sites: el.dataset.worldSites, actors: el.dataset.simulatedActors,
  }));
  const name = await page.locator('[aria-label="Immersive 3D world explorer"] strong').first().innerText();
  await page.screenshot({ path: join(outDir, `world-${letter}.png`) });
  console.log(`WORLD ${letter} ${name} :: drawCalls=${info.drawCalls} sites=${info.sites} actors=${info.actors}`);
}
await browser.close();
console.log('AUDIT DONE ->', outDir);
