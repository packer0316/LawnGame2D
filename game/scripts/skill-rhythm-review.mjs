import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
fs.mkdirSync('art-review',{recursive:true});
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],report=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176'}/?content=real&mode=dev&class=warrior&room=1`);
 await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
  const {GameScene}=await import(url),stats=GameScene.prototype.stats;
  GameScene.prototype.stats=function(){window.s=this;return stats.call(this);};window.__lawnStats();
  window.seen={};window.beats=[];window.samples=[];
  const play=s.skillFx.play.bind(s.skillFx);
  s.skillFx.play=(name,ctx)=>{beats.push({name,at:performance.now(),x:ctx.x});return play(name,ctx);};
  s.events.on('postupdate',()=>{
   for(const o of [...s.skillFx.objects,...s.skillFx.kit.objects]){
    const k=o.texture?.key;if(!k)continue;
    seen[k]??=[];if(!seen[k].includes(+o.frame.name))seen[k].push(+o.frame.name);
    if(k==='skill-assassin-fourblade'&&+o.frame.name===1&&o.alpha>.5)samples.push({at:performance.now(),x:o.x,y:o.y});
   }
  });
 });
 const cases=[['warrior',3,1150,'earth'],['warrior',4,1150,'thrust'],['assassin',1,1320,'fan'],['assassin',4,1000,'boomerang']].filter(c=>!process.env.LAWN_REVIEW_ONLY||c[3]===process.env.LAWN_REVIEW_ONLY);
 for(const facing of [1,-1])for(const [id,slot,at,label]of cases){
  await page.evaluate(({id,facing})=>{
   s.skillFx.clear();s.command({type:'setClass',classId:id});s.player.cooldowns.clear();
   const ground=s.world.groundBelow(700,400);
   Object.assign(s.player.body,{x:700,y:ground.y,vx:0,vy:0,ground:ground.fh,climb:null,facing});s.prevPlayer={x:700,y:ground.y};
   window.seen={};window.beats=[];window.samples=[];
  },{id,facing});
  await page.keyboard.press(String(slot));await page.waitForTimeout(at);
  await page.screenshot({path:`art-review/v5-${label}-${facing}.png`});
  await page.waitForTimeout(3500);
  const result=await page.evaluate(()=>({seen,beats,samples,remaining:s.skillFx.count}));
  assert.equal(result.remaining,0,`${label} cleanup`);
  if(label==='earth'||label==='thrust')assert.deepEqual(result.seen[`skill-sequence-${label}`].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
  if(label==='thrust')assert.equal(result.seen['skill-sequence-earth'],undefined,'thrust must have independent art');
  if(label==='fan'){
   assert.equal(result.beats.filter(b=>b.name==='bladeFan').length,5);
   assert.ok(result.beats.at(-1).at-result.beats[0].at>1500,'fan has measured cadence');
   assert.deepEqual(result.seen['skill-assassin-fourblade'],[2]);
  }
  if(label==='boomerang'){
   assert.deepEqual(result.seen['skill-assassin-fourblade'],[1]);
   assert.ok(result.samples.at(-1).at-result.samples[0].at>1300,'outward, hold and return visible');
   const start=result.samples[0].x,end=result.samples.at(-1).x;
   assert.ok(Math.abs(end-start)<30,'blade returns to launch point');
   assert.ok(result.samples.some(p=>(p.x-start)*facing>250),'blade travels outward in correct direction');
  }
  report.push({label,facing,...result,samples:result.samples.length});
 }
 // Destroy while a repeating blade trail is active: no timer may resurrect particles.
 await page.evaluate(()=>{s.player.cooldowns.clear();});await page.keyboard.press('4');await page.waitForTimeout(650);
 await page.evaluate(()=>s.skillFx.clear());await page.waitForTimeout(1900);
 assert.equal(await page.evaluate(()=>s.skillFx.count),0,'interrupted trail remains cleared');
 await page.goto(pathToFileURL(path.resolve('assets/skills/preview.html')).href);
 await page.locator('#toggle').click();
 for(const id of ['reaper','blade','fire','arcane','shadow','earth','dragon','lightning','soul','thrust']){
  await page.locator(`button[data-id="${id}"]`).click();
  await page.waitForFunction(()=>typeof sheet!=='undefined'&&sheet!==null);
  await page.locator('#frame').fill(id==='reaper'?'11':'7');
  await page.waitForTimeout(80);
  assert.ok(!(await page.locator('#note').innerText()).includes('失敗'));
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`art-review/v5${process.env.LAWN_REVIEW_ONLY?'-'+process.env.LAWN_REVIEW_ONLY:''}-report.json`,JSON.stringify({report,errors},null,2));
 console.log(JSON.stringify({report,errors},null,2));
}finally{await browser.close();}
