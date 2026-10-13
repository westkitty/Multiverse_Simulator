import { test, expect } from './adversarial';

test.describe('immersive 3D gameplay', () => {
  // Software-rasterized WebGL world rebuilds (15 universes per run) need
  // wall-clock headroom on slow/loaded runners; assertions are unchanged.
  test.describe.configure({ timeout: 240_000 });

  test('actual 3D traversal and in-world site discovery reach the authoritative Atlas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: /Enter this universe in 3D/ }).click();
  const explorer = page.getByRole('region', { name: 'Immersive 3D world explorer' });
  await expect(explorer).toBeVisible();
  const protocol = page.getByRole('region', { name: 'World field protocol' });
  await expect(protocol).toBeVisible();
  await expect(protocol).toContainText('The watershed question');
  await expect(protocol).toContainText('0/3 recorded samples');
  await protocol.getByText('Field notebook: observations and next step').click();
  await expect(protocol).toContainText('Unlocated contact');
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
  // Hold W until movement is actually observed, then release. A fixed-time
  // input window is a frame-rate lottery under slow software rasterization
  // (zero rendered frames can land inside it, so the key releases before any
  // movement integrates); poll-while-held keeps the exact assertion — W moves
  // the player — while staying correct at any frame rate.
  await page.keyboard.down('w');
  try {
    await expect.poll(() => coordinates.innerText(), { timeout: 20_000 }).not.toBe(initial);
  } finally {
    await page.keyboard.up('w');
  }

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
  // World-native intervention uses the actual simulation command bus and
  // changes an authoritative scientific metric (not a cosmetic DOM counter).
  const lab = page.getByRole('region', { name: 'World system experiment' });
  await lab.locator('summary').click();
  const soil = lab.getByTestId('field-gauge-meanSoilNutrients');
  await expect(soil).toBeVisible();
  const beforeSoil = await soil.innerText();
  await lab.getByRole('button', { name: /Increase Soil Fertility/ }).click();
  await expect(lab.getByTestId('native-intervention-feedback')).toContainText('Validated command recorded at tick');
  await expect(lab).toContainText('Command event');
  await expect.poll(() => soil.innerText()).not.toBe(beforeSoil);
  await dossier.getByRole('button', { name: 'Full dossier' }).click();
  await expect(page.getByRole('tab', { name: 'Living World Atlas' })).toHaveAttribute('aria-selected', 'true');
  const fullDossier = page.getByRole('region', { name: 'Site investigation inspector' });
  await expect(fullDossier).toBeVisible();
  await expect(fullDossier).toContainText('SURVEYED');
  expect(errors).toEqual([]);
});

test('player can visit a real installation and pay its repair bill from the 3D service order', async ({page}) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button',{name:/Enter this universe in 3D/}).click();
  const explorer=page.getByRole('region',{name:'Immersive 3D world explorer'});
  const lab=page.getByRole('region',{name:'World system experiment'});
  await lab.locator('summary').click();
  const order=lab.getByRole('group',{name:'Expedition maintenance planning'});
  await expect(order).toBeVisible();
  await expect(order.getByTestId('service-damaged-count')).toHaveText('0');
  await expect(order.getByTestId('field-service-guidance')).toContainText('Discover and physically visit');
  await expect(order.getByTestId('field-service-action')).toHaveCount(0);

  // The actual nearby world landmark must be surveyed, discovered and visited
  // before the paid repair order can exist. No synthetic site seeding.
  await explorer.getByRole('button',{name:'Inspect nearby'}).click();
  const dossier=explorer.getByRole('complementary',{name:'Nearby site investigation'});
  await expect(dossier).toContainText('DETECTED');
  await dossier.getByRole('button',{name:'Survey',exact:true}).click();
  await expect(dossier).toContainText('SURVEYED');
  await dossier.getByRole('button',{name:'Discover',exact:true}).click();
  await expect(dossier).toContainText('DISCOVERED');
  await dossier.getByRole('button',{name:'Begin expedition travel'}).click();
  for(let tick=0;tick<12;tick++){
    if(await dossier.getByText('VISITED', {exact:true}).count())break;
    await page.getByRole('button',{name:'Step one tick'}).click();
  }
  await expect(dossier).toContainText('VISITED');
  const repair=order.getByRole('button',{name:/Repair visited installation/});
  await expect(repair).toBeVisible();
  await expect(order.getByTestId('service-damaged-count')).toHaveText('1');
  await repair.click();
  await expect(order.getByTestId('field-service-feedback')).toContainText('repair accepted at tick');
  await expect(order).toContainText('Repairs charge 2 supplies');
  expect(errors).toEqual([]);
});

test('three endangered worlds expose real emergency science commands inside playable 3D', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/explore');
  const worlds = [
    {letter:'G', command:/Dispatch Citywide Infrastructure Repair Brigades/},
    {letter:'H', command:/Dispatch Robotic Overhaul Teams/},
    {letter:'I', command:/Mobilize Post-Disaster Geotechnical Reconstruction/},
  ];
  const switcher = page.getByRole('group', {name:'Quick World Switcher'});
  for (const target of worlds) {
    await switcher.getByRole('button', {name:new RegExp('World '+target.letter+':')}).click();
    const lab = page.getByRole('region', {name:'World system experiment'});
    await expect(lab).toBeVisible();
    await lab.locator('summary').click();
    const emergency = lab.getByRole('group', {name:'Emergency recovery controls'});
    await expect(emergency).toBeVisible();
    await expect(emergency.getByTestId('native-safe-reachable')).toContainText('/ 36');
    await expect(emergency.getByTestId('native-unsafe-destinations')).toBeVisible();
    await expect(emergency.getByTestId('native-route-blocked')).toBeVisible();
    await emergency.getByRole('button', {name:target.command}).click();
    await expect(lab.getByTestId('native-intervention-feedback')).toContainText('Validated command recorded at tick');
    await expect(lab).toContainText('Command event');
    await page.getByRole('button', {name:'Step one tick'}).click();
    await expect(emergency.getByTestId('native-safe-reachable')).toContainText('/ 36');
  }
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
    await expect.poll(() => activeCanvas.evaluate(el => Number((el as HTMLCanvasElement).dataset.drawCalls ?? 0))).toBeGreaterThan(20);
    await expect(explorer.getByRole('button', { name: 'Forward' })).toBeVisible();
    await expect(explorer.getByRole('button', { name: 'Return to Atlas' })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

