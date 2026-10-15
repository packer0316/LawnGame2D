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
try {
 await page.goto(`${baseUrl}/?content=real&mode=dev&class=mage&room=1`);
 await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
 await page.evaluate(async()=>{
   const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
   const {GameScene}=await import(url),stats=GameScene.prototype.stats;
   GameScene.prototype.stats=function(){window.reviewScene=this;return stats.call(this);};window.__lawnStats();
   const scene=window.reviewScene;
   window.reaperFrames=[];window.starts=[];window.fxEvents=[];window.maxFx=0;
   const begin=scene.skillFx.begin.bind(scene.skillFx),play=scene.skillFx.play.bind(scene.skillFx);
   scene.skillFx.begin=(skill,ctx)=>{window.starts.push(skill.id);begin(skill,ctx);};
   scene.skillFx.play=(name,ctx)=>{window.fxEvents.push(name);play(name,ctx);};
   scene.events.on('postupdate',()=>{
     const r=scene.skillFx.activeReaper;
     if(r&&!window.reaperFrames.includes(Number(r.frame.name)))window.reaperFrames.push(Number(r.frame.name));
     window.maxFx=Math.max(window.maxFx,scene.skillFx.count);
   });
 });
 const classes=JSON.parse(fs.readFileSync('../content/class/classes.json','utf8')).classes;
 // Reaper first, before other skills remove its targets.
 await page.keyboard.press('7');
 await page.waitForTimeout(1050);
 await page.screenshot({path:'art-review/reaper-ready-final.png'});
 await page.waitForTimeout(200);
 await page.screenshot({path:'art-review/reaper-cut-final.png'});
 await page.waitForTimeout(2800);
 const frames=await page.evaluate(()=>window.reaperFrames);
 assert.deepEqual([...frames].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i),'all twelve reaper poses actually played');
 for(const cls of classes){
   await page.evaluate(id=>window.reviewScene.command({type:'setClass',classId:id}),cls.id);
   for(let slot=0;slot<cls.skills.length;slot++){
     await page.evaluate(()=>{
       const s=window.reviewScene;
       s.player.cooldowns.clear();
       const m=[...s.monsters.values()].find(m=>m.alive&&m.x>180&&m.x<1100);
       if(m)s.teleportBehind(m);
     });
     await page.keyboard.press(String(slot+1));
     await page.waitForTimeout(950);
     if([0,cls.skills.length-1].includes(slot))await page.screenshot({path:`art-review/skill-${cls.id}-${slot+1}.png`});
     const waitMs=await page.evaluate(id=>Math.max(1550,window.reviewScene.bundle.skills.get(id).strikes.at(-1).atMs),cls.skills[slot]);
     await page.waitForTimeout(waitMs);
   }
 }
 await page.waitForTimeout(2500);
 const result=await page.evaluate(()=>({frames:window.reaperFrames,starts:window.starts,fxEvents:[...new Set(window.fxEvents)],maxFx:window.maxFx,stats:window.__lawnStats()}));
 result.errors=errors;
 fs.writeFileSync('art-review/skill-integration-report.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 assert.deepEqual(errors,[]);
 for(const cls of classes)for(const id of cls.skills)assert.ok(result.starts.includes(id),`${id} started via keyboard`);
 assert.equal(result.stats.skillFx,0);
 // Room transition while a reaper is present must synchronously discard owned sprites/tweens.
 await page.evaluate(()=>{
   const s=window.reviewScene,skill=s.bundle.skills.get('skill_0043');
   const ctx=s.fxContext(skill,skill.strikes[0].area,[],null,700);
   s.skillFx.play('reaper',{...ctx,leadMs:400});
   s.command({type:'changeRoom',roomId:2});
 });
 await page.waitForFunction(()=>window.__lawnStats().room===2);
 await page.waitForTimeout(2000);
 assert.equal(await page.evaluate(()=>window.__lawnStats().skillFx),0);
}finally{await browser.close();}
