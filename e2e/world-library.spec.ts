import { test, expect } from '@playwright/test';

test('World Library exposes every world, honest cross-world contracts, and keyboard-safe selection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('tab', { name: /World Library/ }).click();

  const lattice = page.getByRole('region', { name: 'The realities are not isolated.' });
  await expect(lattice.getByRole('button', { name: /^Select .* world$/ })).toHaveCount(15);
  await expect(lattice.getByRole('img', { name: /15 worlds connected by 13 registered event adapters/ })).toBeVisible();
  await expect(lattice.locator('.reality-lattice__edges [data-adapter]')).toHaveCount(13);

  await expect(page.getByRole('button', { name: 'All worlds (15)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Biosphere & ocean (3)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Planetary systems (4)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orbital & signal (3)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Civilizations & infrastructure (5)' })).toBeVisible();

  const independentWorld = lattice.getByRole('button', { name: 'Select The Machine Wilderness world' });
  await independentWorld.focus();
  await independentWorld.press('Enter');
  await expect(independentWorld).toHaveAttribute('aria-pressed', 'true');
  await expect(lattice.getByText('NO DIRECT CONTRACT')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configure & Launch New Seeded Simulation (The Machine Wilderness)' })).toBeVisible();

  const machineCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'The Machine Wilderness' }) });
  await expect(machineCard.getByRole('button', { name: 'Selected' })).toHaveAttribute('aria-pressed', 'true');
  await expect(machineCard.getByRole('button', { name: 'Quick Launch Scenario' })).toBeVisible();

  await page.getByRole('button', { name: 'Orbital & signal (3)' }).click();
  await expect(page.locator('article').filter({ has: page.getByRole('heading', { name: 'World B — Modular Space Station' }) })).toBeVisible();
  await expect(page.locator('article').filter({ has: page.getByRole('heading', { name: 'The Machine Wilderness' }) })).toHaveCount(0);
  await page.getByRole('button', { name: 'All worlds (15)' }).click();

  await page.getByRole('button', { name: /Open Event Observatory/ }).click();
  await expect(page.getByRole('tab', { name: 'Event Observatory', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
