import { test, expect } from '@playwright/test';

test('actual 3D traversal and in-world site discovery reach the authoritative Atlas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: /Enter this universe in 3D/ }).click();
  const explorer = page.getByRole('region', { name: 'Immersive 3D world explorer' });
  await expect(explorer).toBeVisible();
  const canvas = explorer.getByLabel('Three.js playable universe').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBeGreaterThan(10);
  const coordinates = explorer.getByText(/^X -?\d+ \/ Z -?\d+$/);
  const initial = await coordinates.innerText();
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await expect.poll(() => coordinates.innerText()).not.toBe(initial);

  // Recenter using the already-created world on the next enter. The default
  // spawn is near a real Atlas site, so inspection cannot succeed from a fake HUD.
  await explorer.getByRole('button', { name: 'Return to Atlas' }).click();
  await page.getByRole('tab', { name: 'Explore in 3D' }).click();
  await expect(explorer.getByRole('button', { name: 'Inspect nearby' })).toBeEnabled();
  await explorer.getByRole('button', { name: 'Inspect nearby' }).click();
  const dossier = explorer.getByRole('complementary', { name: 'Nearby site investigation' });
  await expect(dossier).toBeVisible();
  await expect(dossier).toContainText('UNKNOWN');
  await dossier.getByRole('button', { name: 'Detect', exact: true }).click();
  await expect(dossier).toContainText('DETECTED');
  await expect(dossier.getByRole('status')).toContainText('detect accepted');
  await dossier.getByRole('button', { name: 'Full dossier' }).click();
  await expect(page.getByRole('tab', { name: 'Living World Atlas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Site investigation inspector' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('all fifteen universes open real Three.js canvases without leaving exploration mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/explore');
  const explorer = page.getByRole('region', { name: 'Immersive 3D world explorer' });
  const switcher = page.getByRole('group', { name: 'Quick World Switcher' });
  for (const letter of 'ABCDEFGHIJKLMNO') {
    await switcher.getByRole('button', { name: new RegExp('World ' + letter + ':') }).click();
    await expect(page.getByRole('tab', { name: 'Explore in 3D' })).toHaveAttribute('aria-selected', 'true');
    await expect(explorer).toBeVisible();
    await expect(explorer.getByLabel('Three.js playable universe').locator('canvas')).toHaveCount(1);
    await expect(explorer.getByRole('button', { name: 'Forward' })).toBeVisible();
    await expect(explorer.getByRole('button', { name: 'Return to Atlas' })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
