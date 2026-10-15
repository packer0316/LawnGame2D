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
 await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176'}/?content=real&mode=dev&class=assassin&room=1`);
 await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
  const {GameScene}=await import(url),stats=GameScene.prototype.stats;
  GameScene.prototype.stats=function(){window.s=this;return stats.call(this);};window.__lawnStats();
  window.seen={};window.beats=[];window.storms=new Set();window.sizes=[];window.returns=[];window.contacts=[];window.peak=0;window.hitSizes=[];
  const makeSprite=s.add.sprite.bind(s.add);
  s.add.sprite=(x,y,key,frame)=>{
   if(key==='skill-assassin-fourblade'){seen[key]??=[];if(!seen[key].includes(+frame))seen[key].push(+frame);}
   return makeSprite(x,y,key,frame);
  };
  const play=s.skillFx.play.bind(s.skillFx),contact=s.skillFx.goldContact.bind(s.skillFx),back=s.skillFx.returnBlade.bind(s.skillFx);
  s.skillFx.play=(name,ctx)=>{beats.push({name,at:performance.now()});return play(name,ctx);};
  s.skillFx.goldContact=(p,color,power)=>{contacts.push({at:performance.now(),color});return contact(p,color,power);};
  s.skillFx.returnBlade=(blade,ctx,duration)=>{
   const item={from:{x:blade.x,y:blade.y},at:performance.now()};returns.push(item);
   blade.once('destroy',()=>{item.end={x:blade.x,y:blade.y};item.player=ctx.playerAt();item.duration=performance.now()-item.at;});
   return back(blade,ctx,duration);
  };
  s.events.on('postupdate',()=>{
   const fx=s.skillFx;peak=Math.max(peak,fx.count);
   if(fx.storm)storms.add(fx.storm);
   for(const o of [...fx.objects,...fx.kit.objects,...s.projectiles.map(p=>p.sprite)]){
    const k=o.texture?.key;if(!k)continue;
    seen[k]??=[];if(!seen[k].includes(+o.frame.name))seen[k].push(+o.frame.name);
    if(k==='skill-assassin-fourblade'&&+o.frame.name===3&&o.alpha>.9)sizes.push(o.displayWidth);
    if(k==='skill-sequence-goldHit')hitSizes.push(o.displayWidth);
   }
  });
 });
 for(const facing of [1,-1])for(const [slot,label,at]of [['z','basic',800],[1,'storm',1100],[3,'dash',230],[4,'wheel',850],[5,'split',1100]]){
  await page.evaluate(({facing,label})=>{
   s.skillFx.clear();s.command({type:'setClass',classId:'assassin'});s.player.cooldowns.clear();
   const ground=s.world.groundBelow(700,400);
   Object.assign(s.player.body,{x:700,y:ground.y,vx:0,vy:0,ground:ground.fh,climb:null,facing});s.prevPlayer={x:700,y:ground.y};
   window.seen={};window.beats=[];window.storms=new Set();window.sizes=[];window.returns=[];window.contacts=[];window.peak=0;window.hitSizes=[];
   if(label==='basic'){const m=[...s.monsters.values()].find(m=>m.alive);m.step=()=>{};m.x=700+facing*160;m.y=ground.y;}
  },{facing,label});
  await page.keyboard.press(String(slot));await page.waitForTimeout(at);
  await page.screenshot({path:`art-review/v8-${label}-${facing}.png`});
  if(label==='split'){
   // Move during return to prove the destination is live, not the original cast point.
   await page.waitForTimeout(850);
   await page.evaluate(()=>{s.player.body.x+=180;s.prevPlayer.x=s.player.body.x;});
  }
  await page.waitForTimeout(3300);
  const result=await page.evaluate(()=>({seen,beats,storms:storms.size,launches:[...storms].map(t=>t.launched.size),sizes:[...new Set(sizes)],hitSizes:[...new Set(hitSizes)],returns,contacts:contacts.length,peak,remaining:s.skillFx.count}));
  assert.equal(result.remaining,0,`${label} cleanup`);
  if(label==='storm'){
   assert.equal(result.storms,1,'one continuous formation');
   assert.deepEqual(result.launches,[6],'six original blades leave the orbit');
   assert.equal(result.beats.filter(b=>b.name==='bladeFan').length,5);
   assert.deepEqual(result.seen['skill-assassin-fourblade'],[2]);
   for(const key of ['razor','goldHit'])assert.deepEqual(result.seen[`skill-sequence-${key}`].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
  }
  if(label==='wheel')assert.deepEqual(result.seen['skill-assassin-fourblade'],[1]);
  if(['basic','storm','wheel','split'].includes(label)){
   assert.ok(result.hitSizes.some(size=>Math.abs(size-140)<.01),'enlarged gold impact');
   assert.equal(result.seen['skill-sequence-rend'],undefined,'all thrown blades use gold impacts');
  }
  if(label==='basic')assert.deepEqual(result.seen['skill-assassin-fourblade'],[0]);
  if(label==='split'){
   assert.deepEqual(result.seen['skill-assassin-fourblade'],[3]);
   assert.equal(result.seen['skill-sequence-rend'],undefined,'no rotating petal impact on split blades');
   assert.deepEqual(result.seen['skill-sequence-goldHit'].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
   assert.ok(result.sizes.includes(152),'80 percent blade size');
   assert.equal(result.returns.length,10);
   for(const item of result.returns){
    assert.ok(item.duration>=500,'visible return travel');
    assert.ok(Math.hypot(item.end.x-item.player.x,item.end.y-item.player.y)<12,'arrives at current player');
   }
  }
  report.push({label,facing,...result});
 }
 // Deterministic live-contact probe: one eruption per revolution, none without contact.
 const revolutions=await page.evaluate(async()=>{
  s.skillFx.clear();window.contacts=[];
  const skill=s.bundle.skills.get('skill_0035'),ctx=s.fxContext(skill,skill.strikes[0].area,[],null,340);
  let touching=true;ctx.targetsAt=(x,y)=>touching?[{x,y}]:[];
  s.skillFx.play('boomerang',ctx);
  await new Promise(r=>setTimeout(r,720));const hitCount=contacts.length;touching=false;
  await new Promise(r=>setTimeout(r,950));return {hitCount,total:contacts.length,intervals:contacts.slice(1).map((p,i)=>p.at-contacts[i].at)};
 });
 assert.ok(revolutions.hitCount>=3&&revolutions.hitCount<=5);
 assert.equal(revolutions.hitCount,revolutions.total,'no hit bursts in empty space');
 assert.ok(revolutions.intervals.every(ms=>ms>110&&ms<220),'160 ms revolutions');
 for(const slot of [1,4,5]){
  await page.evaluate(()=>{s.command({type:'setClass',classId:'assassin'});s.player.cooldowns.clear();});
  await page.keyboard.press(String(slot));await page.waitForTimeout(700);
  await page.evaluate(()=>s.command({type:'setClass',classId:'warrior'}));await page.waitForTimeout(2800);
  assert.equal(await page.evaluate(()=>s.skillFx.count),0,`interrupted ${slot} cleanup`);
 }
 await page.goto(pathToFileURL(path.resolve('assets/skills/preview.html')).href);
 for(const id of ['razor','rend','goldHit']){
  await page.locator(`button[data-id="${id}"]`).click();
  await page.waitForFunction(()=>typeof sheet!=='undefined'&&sheet!==null);
  await page.locator('#frame').fill('7');
  assert.ok(!(await page.locator('#note').innerText()).includes('失敗'));
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 fs.writeFileSync('art-review/v8-report.json',JSON.stringify({report,revolutions,errors},null,2));
 console.log(JSON.stringify({cases:report.map(r=>({label:r.label,facing:r.facing,peak:r.peak,contacts:r.contacts,returns:r.returns.length,remaining:r.remaining})),revolutions,errors},null,2));
}finally{await browser.close();}
