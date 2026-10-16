import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
fs.mkdirSync('art-review',{recursive:true});
const baseUrl=process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
try {
 await page.goto(`${baseUrl}/?content=real&mode=dev&class=mage&room=1`);
 await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
 await page.evaluate(async()=>{
   const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
   const {GameScene}=await import(url);
   const stats=GameScene.prototype.stats;
   GameScene.prototype.stats=function(){window.reviewScene=this;return stats.call(this);};
   window.__lawnStats();
 });
 console.log('ready',await page.evaluate(()=>({stats:window.__lawnStats(),scene:!!window.reviewScene,keys:[...window.reviewScene.bundle.skills.keys()]})));
 await page.keyboard.press('7');
 await page.waitForTimeout(850);
 await page.screenshot({path:'art-review/reaper-summon.png'});
 await page.waitForTimeout(1400);
 await page.screenshot({path:'art-review/reaper-sweep.png'});
 await page.waitForTimeout(1100);
 await page.screenshot({path:'art-review/reaper-dissolve.png'});
 await page.waitForTimeout(2000);
 const report=await page.evaluate(async()=>{
   const scene=window.reviewScene;
   const results=[];
   // Replay real data's presentation events, with stable target positions to inspect every effect.
   scene.keys.reset?.();
   for(const skill of scene.bundle.skills.values()) {
     scene.skillFx.clear();
     const view=scene.cameras.main.worldView;
     const ctx={classId:skill.classId,x:view.centerX-120,y:view.bottom-90,facing:1,area:{x:view.centerX-100,y:view.bottom-220,w:360,h:200},
       targets:[{x:view.centerX+60,y:view.bottom-130},{x:view.centerX+190,y:view.bottom-130}],
       origin:{x:view.centerX-180,y:view.bottom-90},from:{x:view.centerX-140,y:view.bottom-90},tint:0xffffff,
       leadMs:300,view:{x:view.x,y:view.y,w:view.width,h:view.height},bounds:{x:0,y:0,w:1440,h:680},
       points:[{x:view.centerX+80,y:view.bottom-150},{x:view.centerX-80,y:view.bottom-220}],groundAt:()=>view.bottom-90,
       frame:scene.avatar.motionFrame,remainingMs:1500,reach:300};
     scene.skillFx.begin(skill,ctx);
     const events=[...(skill.cues??[]).map(c=>({...c,cue:true})),...skill.strikes.map((s,i)=>({...s,index:i,cue:false}))].sort((a,b)=>a.atMs-b.atMs);
     let elapsed=0,peak=0;
     for(const event of events){
       await new Promise(r=>setTimeout(r,event.atMs-elapsed));elapsed=event.atMs;
       if(event.fx)scene.skillFx.play(event.fx,ctx);
       if(!event.cue)scene.skillFx.contact(skill,event.index,ctx);
       peak=Math.max(peak,scene.skillFx.count);
     }
     await new Promise(r=>setTimeout(r,2100));
     results.push({id:skill.id,name:skill.name,peak,remaining:scene.skillFx.count});
   }
   return results;
 });
 fs.writeFileSync('art-review/skills-report.json',JSON.stringify({report,errors},null,2));
 console.log(JSON.stringify({report,errors},null,2));
 assert.deepEqual(errors,[]);
 assert.ok(report.every(r=>r.remaining===0),'all presentation objects should expire');
}finally{await browser.close();}
