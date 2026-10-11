import {test,expect} from '@playwright/test';

test('expanded geometry uses bounds-aware WebGL and instrumented draw calls',async({page},testInfo)=>{
  await page.goto('./');
  await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:/World I:/}).click();
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  const canvas=page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-draw-calls',/\d+/);
  const counters=await canvas.evaluate(e=>({drawCalls:Number(e.dataset.drawCalls),visualInstances:Number(e.dataset.visualInstances)}));
  expect(counters.drawCalls).toBeGreaterThan(0);
  expect(counters.drawCalls).toBeLessThan(counters.visualInstances);
  await page.getByRole('button',{name:'Focus selected site',exact:true}).click();
  await page.getByRole('button',{name:'Fit Camera to World'}).click();
  await testInfo.attach('renderer-counters',{body:JSON.stringify({world:'geology',tick:0,...counters,note:'Software Chromium; draw calls, not FPS or hardware memory'}),contentType:'application/json'});
});

test('WebGL unavailable retains the expanded keyboard-accessible map',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind:string,...args:any[]){
      if(kind==='webgl'||kind==='webgl2'||kind==='experimental-webgl')return null;
      return original.apply(this,[kind,...args] as any);
    } as typeof original;
  });
  await page.goto('./');
  await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:/World F:/}).click();
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  const map=page.getByLabel('Interactive two-dimensional world map');await expect(map).toBeVisible();
  const bounds=(await map.getAttribute('viewBox'))!.split(' ').map(Number);
  expect(bounds[2]).toBeGreaterThan(200);
  const target=map.getByRole('button').first();await target.focus();await expect(target).toBeFocused();await target.press('Enter');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
