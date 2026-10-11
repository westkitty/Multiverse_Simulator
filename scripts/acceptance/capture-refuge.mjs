import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('docs/refuge-uplift',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox',...(process.env.SOFTWARE_RENDERING==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
try {
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',393,852]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(process.env.ACCEPTANCE_BASE_URL||'http://127.0.0.1:4173/Multiverse_Simulator/');
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  await page.getByRole('button',{name:'Survey',exact:true}).click();
  await page.getByRole('button',{name:'Discover',exact:true}).click();
  await page.screenshot({path:`docs/refuge-uplift/after-${name}.png`,fullPage:true});
  await page.getByRole('group',{name:'Quick World Switcher'}).getByRole('button',{name:/World J:/}).click();
  await page.getByRole('tab',{name:'Living World Atlas',exact:true}).click();
  await page.locator('.atlas-contacts button').filter({hasText:'region-4 / UNKNOWN'}).first().click();
  for(const action of ['Detect','Survey','Discover','Travel'])await page.getByRole('button',{name:action,exact:true}).click();
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'Advance atlas one tick',exact:true}).click();
  const inspector=page.getByRole('region',{name:'Site investigation inspector'}),crew=page.getByRole('region',{name:'Refuge teams'});
  const before={crew:await crew.innerText(),expedition:await page.locator('.atlas-expedition').innerText()};
  await inspector.screenshot({path:`docs/refuge-uplift/refuge-before-service-${name}.png`});
  await page.getByRole('button',{name:'Rest local teams',exact:true}).click();
  const after={crew:await crew.innerText(),expedition:await page.locator('.atlas-expedition').innerText(),message:await page.getByRole('status').innerText()};
  await inspector.screenshot({path:`docs/refuge-uplift/refuge-after-service-${name}.png`});
  writeFileSync(`docs/refuge-uplift/journey-${name}.json`,JSON.stringify({viewport:{width,height},before,after},null,2)+'\n');
  await page.close();
 }
}finally{await browser.close();}
