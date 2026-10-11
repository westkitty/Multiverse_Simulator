import { test, expect } from '@playwright/test';
import type { SerializedRunRecord } from '../src/core/kernel';

test('production baseline: fifteen worlds, worker, history, inspection, archive and persisted save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const workers: import('@playwright/test').Worker[] = [];
  page.on('worker', worker => workers.push(worker));
  await page.goto('./');
  await expect(page.getByText(/DEVELOPMENT · 15 WORLDS/)).toBeVisible();
  expect(errors).toEqual([]);
  await expect.poll(() => workers.length).toBeGreaterThan(0);
  const worker = workers[0];
  expect(worker.url()).toMatch(/\/Multiverse_Simulator\/assets\/simulation\.worker-.*\.js$/);
  // Confirm the production module initialized; exercise its protocol below.
  await expect.poll(() => worker.evaluate(() => typeof self.onmessage)).toBe('function');
  await expect(page.getByText(/DEVELOPMENT · 15 WORLDS/)).toBeVisible();
  if (process.env.EXPECTED_RELEASE_COMMIT) {
    await expect(page.getByText(/DEVELOPMENT · 15 WORLDS/)).toContainText(process.env.EXPECTED_RELEASE_COMMIT.slice(0, 7));
  }
  await page.getByRole('tab', { name: /World Library/ }).click();
  await page.goBack();
  await expect(page.getByRole('tab', { name: /Active Observatory/ })).toHaveAttribute('aria-selected', 'true');
  for (const letter of 'ABCDEFGHIJKLMNO') {
    await page.getByRole('group', { name: 'Quick World Switcher' }).getByRole('button', { name: new RegExp(`World ${letter}:`) }).click();
    const tick = page.getByText(/TICK:/).first();
    const before = (await tick.innerText()).match(/TICK:\s*(\d+)/)![1];
    await page.getByRole('button', { name: 'Single Step Simulation', exact: true }).click();
    await expect(tick).toContainText(`TICK: ${Number(before) + 1}`);
    await expect(page.getByLabel('Select Entity to Inspect')).toBeVisible();
    await page.getByLabel('Select Entity to Inspect').selectOption({ index: 1 });
  }
  const clock = page.getByText(/TICK:/).first();
  const pausedTick = (await clock.innerText()).match(/TICK:\s*(\d+)/)![1];
  await page.getByRole('button', { name: 'Resume Simulation', exact: true }).click();
  await expect.poll(async () => Number((await clock.innerText()).match(/TICK:\s*(\d+)/)![1])).toBeGreaterThan(Number(pausedTick));
  await page.getByRole('button', { name: 'Pause Simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Accessible Table', exact: false }).click();
  await expect(page.getByRole('region', { name: 'Accessible World State Entity Table' })).toBeVisible();
  await page.getByRole('tab', { name: /World Library/ }).click();
  await expect(page).toHaveURL(/#\/library$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('tab', { name: /Data Vault/ }).click();
  await page.goBack();
  await expect(page.getByRole('tab', { name: /World Library/ })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('tab', { name: /World Library/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Active Observatory/ }).click();
  await page.getByRole('button', { name: 'Single Step Simulation', exact: true }).click();
  await page.getByRole('tab', { name: /Data Vault/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: /Save Active Run to IndexedDB/ }).click();
  await expect(page.getByText(/Saved ".*to IndexedDB/)).toBeVisible();
  await page.getByRole('button', { name: /Verify Archive Round-Trip/ }).click();
  await expect(page.getByText(/Round-Trip Archive Verification PASSED/)).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('OmniverseMultiverseDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<Array<{ record: SerializedRunRecord; meta: { stateHash: string; tick: number } }>>((resolve, reject) => {
        const req = db.transaction('runs').objectStore('runs').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  });
  expect(saved.length).toBeGreaterThan(0);
  const ecoSave = saved.find(entry => entry.record.worldId === 'ecosystem')!;
  expect(ecoSave.record.tick).toBe(5);
  const workerResult = await page.evaluate(async ({ url, record }) => {
    const probe = new Worker(url, { type: 'module' });
    try {
      return await new Promise<{ tick: number; ok: boolean }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker protocol timeout')), 10000);
        probe.onerror = () => { clearTimeout(timer); reject(new Error('Worker failed')); };
        probe.onmessage = event => {
          if (!event.data.ok) { clearTimeout(timer); reject(new Error(event.data.error)); }
          else if (event.data.id === 'init') probe.postMessage({ id: 'step', type: 'STEP_BATCH', steps: 2, maxBudgetMs: 5000 });
          else { clearTimeout(timer); resolve(event.data); }
        };
        probe.postMessage({ id: 'init', type: 'INIT_RUN', record });
      });
    } finally { probe.terminate(); }
  }, { url: worker.url(), record: ecoSave.record });
  expect(workerResult.ok).toBe(true);
  expect(workerResult.tick).toBe(ecoSave.record.tick + 2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Load', exact: true }).first()).toBeVisible();
  await page.getByText('Ecosystem // Trophic Cascade Baseline', { exact: true }).locator('../..').getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('tab', { name: /Active Observatory/ }).click();
  await expect(page.getByRole('button', { name: 'Single Step Simulation', exact: true })).toBeVisible();
  await expect(page.getByText(/TICK:/).first()).toContainText(`TICK: ${ecoSave.record.tick}`);
  await expect(page.getByText(/TICK:/).first()).toContainText(ecoSave.meta.stateHash.slice(0, 8));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
