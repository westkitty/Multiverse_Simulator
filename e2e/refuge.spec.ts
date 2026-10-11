import {test,expect} from '@playwright/test';

test('departure briefing and known-site planning stay keyboard accessible',async({page})=>{
 await page.goto('./');await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
 const briefing=page.getByRole('region',{name:'Departure briefing'});
 await expect(briefing).toContainText('Discover this contact');
 await expect(page.getByRole('button',{name:'Travel',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Survey',exact:true}).click();await page.getByRole('button',{name:'Discover',exact:true}).click();
 await expect(briefing).toContainText('Arrival at tick');await expect(briefing).toContainText('not a forecast of safe arrival');
 const planner=briefing.locator('summary');await planner.focus();await planner.press('Enter');
 await expect(briefing.getByRole('button')).toHaveCount(1);
 await briefing.getByRole('button').click();
 await expect(page.getByRole('button',{name:'Travel',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('actual refuge visit restores the visible team instead of gifting expedition supplies',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('./');await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:/World J:/}).click();
 await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
 await page.locator('.atlas-contacts button').filter({hasText:'region-4 / UNKNOWN'}).first().click();
 for(const action of ['Detect','Survey','Discover','Travel'])await page.getByRole('button',{name:action,exact:true}).click();
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Advance atlas one tick',exact:true}).click();
 const crew=page.getByRole('region',{name:'Refuge teams'});
 await expect(crew).toBeVisible();
 const before=await crew.locator('meter').evaluateAll(nodes=>nodes.reduce((n,node)=>n+(node as HTMLMeterElement).value,0));
 const stocks=await page.locator('.atlas-expedition').innerText();
 await page.getByRole('button',{name:'Rest local teams',exact:true}).click();
 const after=await crew.locator('meter').evaluateAll(nodes=>nodes.reduce((n,node)=>n+(node as HTMLMeterElement).value,0));
 expect(after).toBeGreaterThan(before);
 expect(await page.locator('.atlas-expedition').innerText()).toBe(stocks);
 await expect(page.getByRole('status')).toContainText('local supplies');
 await page.getByRole('button',{name:'Rest local teams',exact:true}).click();
 await expect(page.getByRole('button',{name:'Rest local teams',exact:true})).toBeDisabled();
 await expect(crew).toContainText('No tired teams');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});
