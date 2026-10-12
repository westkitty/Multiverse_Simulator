import { test, expect } from '@playwright/test';

test('actual 3D traversal and in-world site discovery reach the authoritative Atlas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: /Enter this universe in 3D/ }).click();
  const explorer = page.getByRole('region', { name: 'Immersive 3D world explorer' });
  await expect(explorer).toBeVisible();
  await expect(page.getByRole('region', { name: 'Three.js universe expedition' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Site investigation inspector' })).toHaveCount(0);
  const canvas = explorer.getByLabel('Three.js playable universe').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBeGreaterThan(10);
  // The spawn view must face scene content, not an empty quadrant: a populated
  // first frame submits far more than the handful of always-on layers.
  await expect.poll(() => canvas.evaluate(el => Number((el as HTMLCanvasElement).dataset.drawCalls ?? 0))).toBeGreaterThan(20);
  await expect.poll(() => canvas.evaluate(el => Number((el as HTMLCanvasElement).dataset.worldSites ?? 0))).toBe(36);
  const coordinates = explorer.getByText(/^X -?\d+ \/ Z -?\d+$/);
  const initial = await coordinates.innerText();
  await canvas.focus();
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
  // The native ecosystem baseline starts with its first site already detected;
  // advancing its real discovery stage must mutate kernel-owned exploration.
  await expect(dossier).toContainText('DETECTED');
  await dossier.getByRole('button', { name: 'Survey', exact: true }).click();
  await expect(dossier).toContainText('SURVEYED');
  await expect(dossier.getByRole('status')).toContainText('survey accepted');
  await dossier.getByRole('button', { name: 'Full dossier' }).click();
  await expect(page.getByRole('tab', { name: 'Living World Atlas' })).toHaveAttribute('aria-selected', 'true');
  const fullDossier = page.getByRole('region', { name: 'Site investigation inspector' });
  await expect(fullDossier).toBeVisible();
  await expect(fullDossier).toContainText('SURVEYED');
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
    const activeCanvas = explorer.getByLabel('Three.js playable universe').locator('canvas');
    await expect(activeCanvas).toHaveCount(1);
    await expect.poll(() => activeCanvas.evaluate(el => Number((el as HTMLCanvasElement).dataset.drawCalls ?? 0))).toBeGreaterThan(0);
    await expect(explorer.getByRole('button', { name: 'Forward' })).toBeVisible();
    await expect(explorer.getByRole('button', { name: 'Return to Atlas' })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
