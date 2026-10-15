/**
 * Repeatable browser visual QA for the EXISTING playable 3D game.
 * Usage: node scripts/qa-visual-capture.mjs [letters, e.g. ABCDE] [output-directory]
 * Outputs screenshots + a grounded manifest. Does not change simulation state or assets.
 */
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const letters = (process.argv[2] || 'ABCDEFGHIJKLMNO').toUpperCase();
const outputDir = path.resolve(process.argv[3] || '/tmp/multiverse-aaa-visual-qa');
await mkdir(outputDir,{recursive:true});
const server = await preview({ preview:{ port:4187, strictPort:true, host:'127.0.0.1' } });
const browser=await chromium.launch({args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
]});
const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
const results=[];
try {
  await page.goto('http://127.0.0.1:4187/Multiverse_Simulator/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Enter this universe in 3D/}).click();
  const scene=page.getByRole('region',{name:'Immersive 3D world explorer'});
  const switcher=page.getByRole('group',{name:'Quick World Switcher'});
  for(const letter of letters){
    await switcher.getByRole('button',{name:new RegExp('World '+letter+':')}).click();
    await scene.waitFor({state:'visible'});
    const canvas=scene.locator('canvas');
    await canvas.waitFor({state:'visible'});
    await page.waitForFunction(()=>{
      const element=document.querySelector('[aria-label="Immersive 3D world explorer"] canvas');
      return element && Number(element.dataset.artMotifs)>0 && Number(element.dataset.drawCalls)>20;
    },null,{timeout:25000});
    await page.screenshot({path:path.join(outputDir,letter+'-page.png')});
    await scene.screenshot({path:path.join(outputDir,letter+'.png')});
    const read=await canvas.evaluate(el=>({
      drawCalls:Number(el.dataset.drawCalls),artMotifs:Number(el.dataset.artMotifs),
      facadeDetails:Number(el.dataset.facadeDetails),
      artTier:el.dataset.artTier,canvasWidth:el.width,canvasHeight:el.height,
    }));
    results.push({world:letter,...read,sceneVisible:await scene.isVisible()});
  }
} finally {
  await writeFile(path.join(outputDir,'manifest-'+letters+'.json'),JSON.stringify({
    date:new Date().toISOString(),letters,viewport:'1280x900 @ DPR1',results,errors,
  },null,2));
  await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
if(errors.length||results.length!==letters.length)throw new Error(
  'Visual QA incomplete: '+JSON.stringify({errors,passed:results.length,expected:letters.length}));
console.log(JSON.stringify({passed:results.length,results},null,2));
