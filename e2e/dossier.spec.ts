import {test,expect} from '@playwright/test';

test('field dossier preserves a sample while telemetry changes, rejects resupply safely, and resets across worlds',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  const inspector=page.getByRole('region',{name:'Site investigation inspector'});
  await expect(inspector.getByRole('button',{name:'Survey',exact:true})).toBeEnabled();
  await expect(inspector.getByRole('button',{name:'Investigate',exact:true})).toBeDisabled();
  await expect(page.getByRole('region',{name:'Evidence comparison'})).toHaveCount(0);
  await inspector.getByRole('button',{name:'Resupply from local stocks'}).click();
  await expect(page.getByRole('status')).toContainText('Visit a local site before resupplying');
  for(const action of ['Survey','Discover','Travel'])await inspector.getByRole('button',{name:action,exact:true}).click();
  await expect(inspector.getByRole('button',{name:'Resupply from local stocks'})).toBeDisabled();
  await page.getByRole('button',{name:'Advance atlas one tick',exact:true}).click();
  await inspector.getByRole('button',{name:'Investigate',exact:true}).click();
  const evidence=page.getByRole('region',{name:'Evidence comparison',exact:true});
  const row=evidence.locator('tbody tr').first();
  const sample=await row.locator('td').nth(0).innerText();
  const current=await row.locator('td').nth(1).innerText();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Advance atlas one tick',exact:true}).click();
  expect(await row.locator('td').nth(0).innerText()).toBe(sample);
  expect(await row.locator('td').nth(1).innerText()).not.toBe(current);
  const difference=await row.locator('td').nth(2).innerText();
  expect(difference).not.toMatch(/^0\n/);
  await expect(evidence).toContainText('GENERATED HISTORY / NOT AN OBSERVED EVENT');
  const chronicle=page.getByRole('region',{name:'Site causal casefile'});
  await expect(chronicle).toBeVisible();
  await expect(chronicle.getByRole('list',{name:'Recorded site changes'})).toContainText('investigate');
  await page.getByLabel('Region filter').selectOption({index:1});
  await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:/World K:/}).click();
  // Quick-switch intentionally returns to the Scientific Observatory; preserve that journey.
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  await expect(page.getByLabel('Region filter')).toHaveValue('all');
  await expect(page.getByRole('status')).not.toContainText('accepted');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Primary command remains directly keyboard-operable.
  const survey=inspector.getByRole('button',{name:'Survey',exact:true});await survey.focus();await survey.press('Enter');
  await expect(page.getByRole('status')).toContainText('survey accepted');
  expect(errors).toEqual([]);
});

test('workbench tabs support arrow keys and mobile navigation leaves room for the world',async({page},testInfo)=>{
  await page.goto('./');
  const tabs=page.getByRole('tablist',{name:'Multiverse workbench tabs'});
  await expect(tabs.getByRole('tab')).toHaveCount(10);
  const observatory=tabs.getByRole('tab',{name:'Active Observatory',exact:true});
  await observatory.focus();await observatory.press('Home');
  const explore=tabs.getByRole('tab',{name:'Explore in 3D',exact:true});
  await expect(explore).toHaveAttribute('aria-selected','true');await expect(explore).toBeFocused();
  await explore.press('ArrowRight');
  const atlas=tabs.getByRole('tab',{name:'Living World Atlas',exact:true});
  await expect(atlas).toHaveAttribute('aria-selected','true');await expect(atlas).toBeFocused();
  await atlas.press('ArrowRight');
  const library=tabs.getByRole('tab',{name:/World Library/});await expect(library).toHaveAttribute('aria-selected','true');
  await expect(library).toBeFocused();await library.press('ArrowLeft');
  await expect(page.getByRole('region',{name:'Living World Atlas',exact:true})).toBeVisible();
  expect(await tabs.locator('[tabindex="0"]').count()).toBe(1);
  if(testInfo.project.name==='mobile')expect((await page.locator('header').first().boundingBox())!.height).toBeLessThan(300);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
