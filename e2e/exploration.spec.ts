import { test, expect } from '@playwright/test';

test('all fifteen worlds expose usable, persistent site exploration', async ({ page }) => {
  // All 15 modules each execute a complete exploration journey under software Chromium.
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  for(const letter of 'ABCDEFGHIJKLMNO') {
    await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:new RegExp(`World ${letter}:`)}).click();
    await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
    await expect(page.getByRole('region',{name:'Living World Atlas'})).toBeVisible();
    const inspector=page.getByRole('region',{name:'Site investigation inspector'});
    await inspector.getByRole('button',{name:'Survey',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('survey accepted');
    await inspector.getByRole('button',{name:'Discover',exact:true}).click();
    await inspector.getByRole('button',{name:'Travel',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('travel accepted');
    await page.getByRole('button',{name:'Advance atlas one tick'}).click();
    await inspector.getByRole('button',{name:'Investigate',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('investigate accepted');
    await expect(inspector.getByText(/OBSERVED/)).toBeVisible();
    await inspector.getByRole('button',{name:'Repair',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('repair accepted');
    await inspector.getByRole('button',{name:'Resolve',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('resolve accepted');
    await inspector.getByRole('button',{name:'Operate',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('operate accepted');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByRole('button',{name:'Save / export'}).click();
  await page.getByRole('button',{name:/Save Active Run to IndexedDB/}).click();
  await expect(page.getByText(/Saved ".*to IndexedDB/)).toBeVisible();
  await page.reload();
  // Locate the persisted row by its world metadata rather than a generated run name.
  await page.getByText(/World: signal-expanse/).locator('../..').getByRole('button',{name:'Load',exact:true}).click();
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  await expect(page.getByRole('region',{name:'Site investigation inspector'}).getByText(/RESOLVED/)).toBeVisible();
  expect(errors).toEqual([]);
});
