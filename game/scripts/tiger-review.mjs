import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review',{recursive:true});
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],report=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const [side,upper]of [['left',false],['right',false],['left',true],['right',true]]){
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176'}/?content=real&mode=dev&class=warrior&room=1`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
  await page.evaluate(async({side,upper})=>{
   const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
   const {GameScene}=await import(url),stats=GameScene.prototype.stats;
   GameScene.prototype.stats=function(){window.s=this;return stats.call(this);};window.__lawnStats();
   const platforms=s.world.segments.filter(p=>p.oneWay&&p.x2-p.x1>100).sort((a,b)=>a.y1-b.y1);
   let x=side==='left'?250:s.world.width-250,fromY=400;
   if(upper){const y=platforms[0].y1;const same=platforms.filter(p=>Math.abs(p.y1-y)<30);const seg=side==='left'?same[0]:same.at(-1);x=side==='left'?seg.x1+30:seg.x2-30;fromY=seg.y1-2;}
   const ground=s.world.groundBelow(x,fromY);
   Object.assign(s.player.body,{x,y:ground.y,ground:ground.fh,vx:0,vy:0,climb:null,facing:side==='left'?-1:1});s.prevPlayer={x,y:ground.y};
   window.frames=[];window.hits=[];window.samples=[];
   const apply=s.applyHits.bind(s);
   s.applyHits=(skill,index,targets)=>{
    if(skill.id==='skill_0009'&&s.skillFx.tiger)hits.push({index,frame:+s.skillFx.tiger.sprite.frame.name,x:s.skillFx.tiger.sprite.x,box:s.skillFx.tigerHitRect(index),targets:targets.map(m=>({uid:m.spawn.uid,y:m.y,floor:s.skillFx.tigerFloorAt(m.x)}))});
    return apply(skill,index,targets);
   };
   s.events.on('postupdate',()=>{const t=s.skillFx.tiger;if(t?.sprite.active){const p=t.sprite;if(!frames.includes(+p.frame.name))frames.push(+p.frame.name);samples.push({time:t.elapsed,x:p.x,y:p.y,alpha:p.alpha,frame:+p.frame.name});}});
  },{side,upper});
  await page.waitForTimeout(600);await page.keyboard.press('6');await page.waitForTimeout(50);
  const route=await page.evaluate(()=>{
   const t=s.skillFx.tiger,r=t.route,mobs=[...s.monsters.values()];window.otherFloor=[];
   for(let i=0;i<Math.min(15,mobs.length);i++){
    const m=mobs[i],slot=i%5;const x=r.direction===1?r.left+(r.right-r.left)*(slot+.5)/5:r.right-(r.right-r.left)*(slot+.5)/5;
    m.step=()=>{};m.x=x;m.y=t.floorAt(x)+(i<5?0:i<10?-145:145);
    if(i>=5)otherFloor.push(m.spawn.uid);
   }
   return r;
  });
  await page.waitForTimeout(850);await page.screenshot({path:`art-review/tiger-${side}-${upper?'upper':'ground'}.png`});
  await page.waitForTimeout(3100);
  const result=await page.evaluate(()=>({frames,hits,samples,otherFloor,remaining:s.skillFx.count}));
  assert.equal(route.direction,side==='left'?1:-1);
  assert.deepEqual(result.frames.sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));
  assert.equal(result.hits.length,5);
  assert.ok(result.hits.every(h=>h.frame===5),'jaws close on actual hit');
  assert.ok(result.hits.every(h=>h.targets.length>0),'each section finds a same-floor enemy');
  assert.ok(result.hits.every(h=>h.targets.every(m=>!result.otherFloor.includes(m.uid))),'other floors excluded');
  assert.ok(result.samples.every(p=>p.alpha===1),'body stays fully opaque');
  for(let i=1;i<result.samples.length;i++){
   const a=result.samples[i-1],b=result.samples[i];
   if(b.time>a.time)assert.ok((b.x-a.x)*route.direction>0,'no attack movement hold');
  }
  const last=result.samples.at(-1);
  assert.ok(route.direction===1?last.x>route.right+170:last.x<route.left-170,'body exits the far side');
  assert.equal(result.remaining,0);
  report.push({side,upper,route,...result,samples:result.samples.length});
 }
 // Interruption must clear spirit, repeating trails and all descendants.
 await page.evaluate(()=>s.player.cooldowns.clear());await page.keyboard.press('6');await page.waitForTimeout(800);
 await page.evaluate(()=>s.skillFx.clear());await page.waitForTimeout(3300);
 assert.equal(await page.evaluate(()=>s.skillFx.count),0);
 assert.deepEqual(errors,[]);
 fs.writeFileSync('art-review/tiger-report.json',JSON.stringify({report,errors},null,2));
 console.log(JSON.stringify({cases:report.map(r=>({side:r.side,upper:r.upper,frames:r.frames,hits:r.hits.length,remaining:r.remaining})),errors},null,2));
}finally{await browser.close();}
