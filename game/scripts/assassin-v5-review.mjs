import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review/assassin-v5',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5183'}/?content=real&mode=dev&class=assassin`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
    const {GameScene}=await import(url),stats=GameScene.prototype.stats;
    GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
    window.normalUpdate=s.sys.sceneUpdate;s.sys.sceneUpdate=()=>{};
    s.player.body.x=700;s.player.body.y=s.world.height-100;
    for(let i=0;i<20;i++)s.update(0,1000/60);
    s.player.body.facing=1;
    window.beats=[];const apply=s.applyHits.bind(s);
    s.applyHits=(skill,index,...args)=>{if(skill.id==='skill_0032')beats.push(index);return apply(skill,index,...args)};
    s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:0,roll:false});
    window.storm=s.skillFx.storm;
    if(!storm)throw Error('Storm did not start');
    window.steered=false;window.maxSpeed=0;
    window.advance=at=>{
      let steps=0;
      while(storm.elapsed<at&&storm.active&&steps++<500){
        s.update(0,1000/60);
        for(const f of storm.flights.values()){
          if(f.state.age>160&&Math.abs(f.state.angle-.295)>0.2)steered=true;
          maxSpeed=Math.max(maxSpeed,f.state.speed);
        }
      }
    };
  });
  for(const at of [280,580,950,1460,1920]){
    await page.evaluate(at=>advance(at),at);
    await page.screenshot({path:`art-review/assassin-v5/storm-${at}.png`});
    if(at===950)assert.equal(await page.evaluate(()=>{
      s.command({type:'inventoryOpen',open:true});const before=storm.elapsed,angle=storm.blades.find(b=>b.active)?.rotation;
      for(let i=0;i<40;i++)s.update(0,1000/60);
      const same=before===storm.elapsed&&angle===storm.blades.find(b=>b.active)?.rotation;
      s.command({type:'inventoryOpen',open:false});return same;
    }),true);
  }
  await page.evaluate(()=>{for(let i=0;i<200;i++)s.update(0,1000/60)});
  const stormReport=await page.evaluate(()=>({launches:storm.launched.size,steered,maxSpeed,beats,active:storm.active,bladesAlive:storm.blades.filter(b=>b.active).length}));
  assert.equal(stormReport.launches,6);assert.equal(stormReport.steered,true);assert.ok(stormReport.maxSpeed>1);
  assert.deepEqual(stormReport.beats,[0,1,2,3,4]);assert.equal(stormReport.bladesAlive,0);
  // Deterministic contact fixture exercises the existing live-contact callback each revolution.
  await page.evaluate(()=>{
    window.bursts=[];const burst=s.skillFx.kit.burst.bind(s.skillFx.kit);
    s.skillFx.kit.burst=(x,y,color,power,count,...rest)=>{bursts.push({color,count});return burst(x,y,color,power,count,...rest)};
    const skill=s.bundle.skills.get('skill_0035');
    const ctx=s.fxContext(skill,skill.strikes[0].area,[],null,0);
    ctx.targetsAt=(x,y)=>[{x,y,id:'particle-contact-fixture'}];
    s.skillFx.boomerang(ctx);
  });
  await page.waitForTimeout(820);
  await page.screenshot({path:'art-review/assassin-v5/boomerang-contact.png'});
  const burstReport=await page.evaluate(()=>bursts);
  assert.ok(burstReport.some(b=>b.color===0xbaffde&&b.count===18));
  assert.ok(burstReport.some(b=>b.color===0xffefa8&&b.count===8));
  await page.evaluate(()=>s.skillFx.clear());
  assert.equal(await page.evaluate(()=>s.skillFx.count),0);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>s.skillFx.count),0);
  assert.deepEqual(errors,[]);
  const report={storm:stormReport,brightContactBursts:burstReport.filter(b=>b.count>=8).length,errors};
  fs.writeFileSync('art-review/assassin-v5/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
