import {chromium} from '@playwright/test';
import {writeFileSync,existsSync} from 'node:fs';
import {cpus,platform,release,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';
const software=process.env.SOFTWARE_RENDERING==='1';
const browser=await chromium.launch({headless:process.env.HEADED!=='1',executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage',...(software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ACCEPTANCE_BASE_URL||'http://127.0.0.1:4173/Multiverse_Simulator/');
 await page.locator('canvas').first().waitFor({state:'visible'});
 const observation=await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas');const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
  const debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=gl?(debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)):null;
  const intervals=[];let last;
  const start=performance.now();await new Promise(resolve=>{const frame=now=>{if(last!==undefined)intervals.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
  intervals.sort((a,b)=>a-b);
  return {userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,renderer,webglVersion:gl?.getParameter(gl.VERSION)??null,frames:intervals.length+1,p50FrameIntervalMs:intervals[Math.floor(intervals.length*.5)],p95FrameIntervalMs:intervals[Math.floor(intervals.length*.95)],meanAnimationFrameHz:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),heap:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null};
 });
 const hardwareCandidate=!!observation.renderer&&!/swiftshader|llvmpipe|software|subzero/i.test(observation.renderer)&&!software;
 const report={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),measuredAt:new Date().toISOString(),status:hardwareCandidate?'UNVERIFIED_PHYSICAL_DEVICE_PROVENANCE':'BLOCKED_HARDWARE_RENDERING',method:'Five-second requestAnimationFrame interval sample on initial paused Observatory canvas; not GPU execution time, active simulation throughput, or sustained thermal/load acceptance. No FPS target inferred.',headless:process.env.HEADED!=='1',forcedSoftwareRendering:software,host:{platform:platform(),release:release(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,reportedMemoryBytes:totalmem(),driDeviceDirectory:existsSync('/dev/dri')},viewport:{width:1440,height:1000},observation,pageErrors:errors,limitations:['Device metadata is browser/OS reported, not independent physical-device attestation.','A software result cannot pass hardware acceptance.','Real desktop and physical mobile active-world trials, thermal duration, GPU memory and deployed build identity remain required.']};
 writeFileSync(process.env.ACCEPTANCE_OUTPUT||'docs/acceptance/device-profile.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
