import { test, expect } from '@playwright/test';

test('expanded geometry uses bounded draw calls and records renderer work', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('group', { name: 'Quick World Switcher' }).getByRole('button', { name: /World I:/ }).click();
  await page.getByRole('tab', { name: 'Living World Atlas', exact: true }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-draw-calls', /\d+/);
  const counters = await canvas.evaluate(element => ({
    drawCalls: Number(element.dataset.drawCalls),
    visualInstances: Number(element.dataset.visualInstances),
    topologySyncs: Number(element.dataset.topologySyncs),
    entitySyncs: Number(element.dataset.entitySyncs),
  }));
  expect(counters.drawCalls).toBeGreaterThan(0);
  expect(counters.drawCalls).toBeLessThanOrEqual(12);
  expect(counters.drawCalls).toBeLessThan(counters.visualInstances);
  expect(counters.topologySyncs).toBeGreaterThan(0);
  expect(counters.entitySyncs).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Focus selected site', exact: true }).click();
  await page.getByRole('button', { name: 'Fit Camera to World' }).click();
  await testInfo.attach('renderer-counters', {
    body: JSON.stringify({ world: 'geology', tick: 0, ...counters, note: 'Software Chromium; draw calls and synchronization counts, not FPS or hardware memory' }),
    contentType: 'application/json',
  });
});

test('idle topology is synchronized once; an explicit simulation tick updates it once', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('group', { name: 'Quick World Switcher' }).getByRole('button', { name: /World I:/ }).click();
  await page.getByRole('tab', { name: 'Living World Atlas', exact: true }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-topology-syncs', /\d+/);
  await page.waitForTimeout(250);
  const idle = await canvas.evaluate(element => ({
    topologySyncs: Number(element.dataset.topologySyncs),
    entitySyncs: Number(element.dataset.entitySyncs),
  }));
  await page.waitForTimeout(220);
  const stillIdle = await canvas.evaluate(element => ({
    topologySyncs: Number(element.dataset.topologySyncs),
    entitySyncs: Number(element.dataset.entitySyncs),
  }));
  expect(stillIdle).toEqual(idle);

  await page.getByRole('button', { name: 'Advance atlas one tick', exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-topology-syncs')))
    .toBe(idle.topologySyncs + 1);
  await page.waitForTimeout(250);
  const stepped = await canvas.evaluate(element => ({
    topologySyncs: Number(element.dataset.topologySyncs),
    entitySyncs: Number(element.dataset.entitySyncs),
  }));
  expect(stepped.topologySyncs).toBe(idle.topologySyncs + 1);
  expect(stepped.entitySyncs).toBeGreaterThan(idle.entitySyncs);
  expect(stepped.entitySyncs).toBeLessThan(idle.entitySyncs + 20);

  await testInfo.attach('frame-sync-counters', {
    body: JSON.stringify({ idle, stillIdle, stepped, note: 'Synchronization operation counts, not wall-clock performance' }),
    contentType: 'application/json',
  });
});

test('WebGL unavailable retains the expanded keyboard-accessible map', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return original.apply(this, [kind, ...args] as any);
    } as typeof original;
  });
  await page.goto('./');
  await page.getByRole('group', { name: 'Quick World Switcher' }).getByRole('button', { name: /World F:/ }).click();
  await page.getByRole('tab', { name: 'Living World Atlas', exact: true }).click();
  const map = page.getByLabel('Interactive two-dimensional world map');
  await expect(map).toBeVisible();
  const bounds = (await map.getAttribute('viewBox'))!.split(' ').map(Number);
  expect(bounds[2]).toBeGreaterThan(200);
  const target = map.getByRole('button').first();
  await target.focus();
  await expect(target).toBeFocused();
  await target.press('Enter');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
