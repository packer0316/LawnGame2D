import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review/warrior-blades',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5183'}/?content=real&mode=dev&class=warrior`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
    const {GameScene}=await import(url),stats=GameScene.prototype.stats;
    GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
    s.sys.sceneUpdate=()=>{};
    window.spawned={whirl:0,holy:0};window.beats=[];
    const sprite=s.add.sprite.bind(s.add);s.add.sprite=(x,y,key,...args)=>{
      if(key==='warrior-blade-whirl-v11')spawned.whirl++;
      if(key==='warrior-blade-holy-v13')spawned.holy++;
      return sprite(x,y,key,...args);
    };
    const apply=s.applyHits.bind(s);s.applyHits=(skill,index,...args)=>{beats.push({id:skill.id,index});return apply(skill,index,...args)};
    window.start=(slot,facing=1)=>{
      s.command({type:'setClass',classId:'warrior'});s.player.cooldowns.clear();
      s.player.body.x=s.world.width/2;s.player.body.y=s.world.height-80;s.player.body.vx=0;s.player.body.vy=0;
      for(let i=0;i<10;i++)s.update(0,1000/60);
      s.player.body.facing=facing;
      s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:slot,roll:false});
    };
    window.advance=at=>{let i=0;while(s.player.state.kind==='attack'&&s.player.state.elapsed<at&&i++<400)s.update(0,1000/60);if(i>=400)throw Error('Skill clock stalled')};
    start(0);
  });
  for(const at of [200,350,560]){
    await page.evaluate(at=>advance(at),at);
    assert.equal(await page.evaluate(()=>s.skillFx.warriorBlades.spin.halves.length),6);
    assert.equal(await page.evaluate(()=>spawned.whirl),6);
    await page.screenshot({path:`art-review/warrior-blades/whirl-${at}.png`});
  }
  const rings=await page.evaluate(()=>s.skillFx.warriorBlades.spin.halves.filter((_,i)=>i%2===0)
    .map(s=>({frame:s.frame.name,width:s.displayWidth,rotation:s.rotation})));
  assert.equal(new Set(rings.map(r=>r.width)).size,3);
  assert.equal(new Set(rings.map(r=>r.rotation)).size,3);
  assert.ok(new Set(rings.map(r=>r.frame)).size>1);
  assert.equal(await page.evaluate(()=>beats.filter(b=>b.id==='skill_0004').length),5);
  await page.evaluate(()=>{for(let i=0;i<100;i++)s.update(0,1000/60);start(6)});
  await page.evaluate(()=>advance(420));
  const pair=await page.evaluate(()=>s.skillFx.warriorBlades.waves.map(w=>({x:w.sprite.x,left:w.sprite.getBounds().left,right:w.sprite.getBounds().right,flip:w.sprite.flipX})));
  assert.equal(pair.length,2);assert.ok(pair[0].right<pair[1].left);assert.equal(pair[0].flip,true);assert.equal(pair[1].flip,false);
  await page.screenshot({path:'art-review/warrior-blades/holy-start.png'});
  await page.evaluate(()=>{
    const fx=s.skillFx.warriorBlades;s.command({type:'inventoryOpen',open:true});const before=fx.waves[0].age,artBefore=fx.waves[0].artAge;
    for(let i=0;i<60;i++)s.update(0,1000/60);
    if(fx.waves[0].age!==before||fx.waves[0].artAge!==artBefore)throw Error('Holy wave advanced while paused');
    s.command({type:'inventoryOpen',open:false});
  });
  for(const at of [650,850,1250,1400]){
    await page.evaluate(at=>advance(at),at);
    assert.equal(await page.evaluate(()=>spawned.holy),2);
    await page.screenshot({path:`art-review/warrior-blades/holy-${at}.png`});
  }
  assert.equal(await page.evaluate(()=>beats.filter(b=>b.id==='skill_0040').length),5);
  await page.evaluate(()=>{for(let i=0;i<100;i++)s.update(0,1000/60)});
  assert.equal(await page.evaluate(()=>s.skillFx.warriorBlades.count),0);
  // Deterministic cosmetic encounter: freeze only the contacting blade, then resume;
  // a moving monster's stable id must never trigger repeated holds during this flight.
  const moonContact=await page.evaluate(()=>{
    start(6);advance(420);
    const fx=s.skillFx.warriorBlades,left=fx.waves[0],right=fx.waves[1];
    const target={id:'review-monster',x:right.sprite.x+40,y:right.sprite.y};
    for(const w of fx.waves){w.hit.clear();w.holdMs=0;w.recoverMs=0;w.contactCooldown=0;}
    right.ctx.targetsAt=(x,y,r)=>Math.hypot(target.x-x,target.y-y)<r?[target]:[];
    let impacts=0,audio=0;window.__lawnSfx.onPlay=name=>{if(name==='moonblade:contact')audio++};
    const impact=fx.onMoonImpact;fx.onMoonImpact=()=>{impacts++;impact(target)};
    for(let i=0;i<10&&right.holdMs===0;i++)fx.step(16);
    if(right.holdMs!==60)throw Error('No contact hold');
    const x=right.sprite.x,rotation=right.sprite.rotation,leftX=left.sprite.x,flame=right.sprite.frame.name;
    fx.step(40);
    if(right.sprite.x!==x||right.sprite.rotation!==rotation)throw Error('Moon moved during contact hold');
    if(left.sprite.x===leftX)throw Error('Unrelated moon stopped');
    if(right.sprite.frame.name===flame)throw Error('Attached flames froze during bite');
    fx.step(32);
    if(right.sprite.x<=x||right.sprite.rotation===rotation)throw Error('Moon did not resume');
    for(let i=0;i<20;i++){target.x+=1;fx.step(16);}
    if(impacts!==1||audio!==1)throw Error('Repeated impact or missing contact sound');
    if(!Array.from({length:16},(_,i)=>s.textures.get('warrior-blade-holy-v13').has(String(i))).every(Boolean))throw Error('Missing flame phase');
    right.ctx.targetsAt=()=>[];
    const simulate=(dt,count)=>{right.age=0;right.holdMs=60;right.recoverMs=90;for(let i=0;i<count;i++)fx.step(dt);return right.age};
    const fine=simulate(16,12),coarse=simulate(48,4);
    if(Math.abs(fine-coarse)>1e-6)throw Error('Recovery depends on frame rate');
    fx.onMoonImpact=impact;
    fx.clear();
    if(fx.count!==0)throw Error('Moon sparks leaked');
    return {holdMs:60,impacts,audio,flamesDuringHold:true,resumed:true,independent:true,recoveryFrameIndependent:true};
  });
  // Left-facing spin preserves the same non-overlapping near/far halves and cancels cleanly.
  await page.evaluate(()=>{for(let i=0;i<120;i++)s.update(0,1000/60);start(0,-1);advance(300)});
  assert.equal(await page.evaluate(()=>s.skillFx.warriorBlades.spin.halves.every(s=>s.flipX)),true);
  await page.evaluate(()=>s.command({type:'setClass',classId:'mage'}));
  assert.equal(await page.evaluate(()=>s.skillFx.warriorBlades.count),0);
  assert.deepEqual(errors,[]);
  const report={rings,pair,moonContact,beats:await page.evaluate(()=>beats),errors};
  fs.writeFileSync('art-review/warrior-blades/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
