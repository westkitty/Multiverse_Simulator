import { test, expect } from '@playwright/test';

test('enter the immersive 3D environment for each of the fifteen universes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const switcher = page.getByRole('group', { name: 'Quick World Switcher' });
  for (const letter of 'ABCDEFGHIJKLMNO') {
    await switcher.getByRole('button', { name: new RegExp('World ' + letter + ':') }).click();
    await page.getByRole('tab', { name: 'Living World Atlas' }).click();
    await page.getByRole('button', { name: 'Enter 3D world' }).click();
    await expect(page.getByRole('region', { name: 'Immersive 3D world explorer' })).toBeVisible();
    await expect(page.getByLabel('Three.js playable universe')).toBeVisible();
    await page.getByRole('button', { name: 'Forward' }).focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    await page.keyboard.up('w');
    await expect(page.getByRole('button', { name: 'Return to Atlas' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to Atlas' }).click();
    await expect(page.getByRole('button', { name: 'Atlas overview' })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(errors).toEqual([]);
});
