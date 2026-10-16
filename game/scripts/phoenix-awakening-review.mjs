import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review/phoenix-awakening',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('has no frame'))errors.push(m.text())});
try{
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5183'}/?content=real&mode=dev&class=archer`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0,{timeout:90000});
  await page.waitForTimeout(500);
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
    const {GameScene}=await import(url),stats=GameScene.prototype.stats;
    GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
    s.sys.sceneUpdate=()=>{};window.beats=[];window.sounds=[];window.startZoom=s.cameras.main.zoom;
    window.initialIds=[...s.monsters.values()].filter(m=>m.alive).map(m=>String(m.spawn.uid));
    window.__lawnSfx.onPlay=name=>sounds.push(name);
    const apply=s.applyHits.bind(s);s.applyHits=(skill,index,targets,...rest)=>{
      if(skill.id==='skill_0050')beats.push({index,ms:s.skillFx.phoenix.elapsed,targets:targets.length,ids:targets.map(m=>String(m.spawn.uid))});
      return apply(skill,index,targets,...rest);
    };
  });
  await page.keyboard.press('8');
  await page.evaluate(()=>{s.update(0,17);if(s.player.attacking?.id!=='skill_0050')throw Error('Slot 8 not bound')});
  const frames=[];
  for(const [label,at]of [['eyes',360],['portrait',850],['launch',1450],['outside',2000],['wings',2450],['feathers',2800],['hit',3050],['barrage',3850],['final-barrage',5050],['finish',5400]]){
    await page.evaluate(at=>{let steps=0;while(s.skillFx.phoenix&&s.skillFx.phoenix.elapsed<at&&steps++<1000)s.update(0,1000/60)},at);
    frames.push(await page.evaluate(label=>{
      const fx=s.skillFx.phoenix;
      return {label,ms:fx.elapsed,objects:fx.count,feathers:fx.feathers.length,bird:{x:fx.bird.x,y:fx.bird.y,visible:fx.bird.visible},bursts:fx.bursts.length};
    },label));
    if(label==='outside')assert.equal(await page.evaluate(()=>s.skillFx.phoenix.bird.visible),false);
    if(label==='feathers'){
      assert.ok(await page.evaluate(()=>s.skillFx.phoenix.feathers.length>=24));
      assert.equal(await page.evaluate(()=>{
        s.command({type:'inventoryOpen',open:true});const before=s.skillFx.phoenix.elapsed;
        for(let i=0;i<60;i++)s.update(0,1000/60);
        const same=s.skillFx.phoenix.elapsed===before;s.command({type:'inventoryOpen',open:false});return same;
      }),true);
    }
    await page.screenshot({path:`art-review/phoenix-awakening/${label}.png`});
  }
  await page.evaluate(()=>{window.finishedFx=s.skillFx.phoenix;for(let i=0;i<150;i++)s.update(0,1000/60)});
  const report=await page.evaluate(()=>({beats,sounds,initialIds,remaining:finishedFx.count,phoenix:s.skillFx.phoenix!==null,zoom:s.cameras.main.zoom,startZoom,visible:s.avatar.visible}));
  assert.equal(report.beats.length,56);assert.ok(report.beats.some(b=>b.targets>0));assert.ok(report.beats.every(b=>b.targets<=3));assert.equal(report.remaining,0);
  Array.from({length:56},(_,i)=>2850+i*45).forEach((at,i)=>assert.ok(Math.abs(report.beats[i].ms-at)<18));
  assert.ok(report.initialIds.every(id=>report.beats.some(b=>b.ids.includes(id))),'Every initial monster must be targeted');
  assert.equal(report.phoenix,false);assert.equal(report.zoom,report.startZoom);assert.equal(report.visible,true);
  assert.ok(report.sounds.filter(s=>s==='phoenix:hit').length>15);
  await page.evaluate(()=>{
    s.player.cooldowns.clear();s.player.body.x=s.world.width-100;
    s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:7,roll:false});
    for(let i=0;i<155;i++)s.update(0,1000/60);
    window.cancelled=s.skillFx.phoenix;
    if(!cancelled?.corner.right||!cancelled.bird.flipX)throw Error('Right corner is not mirrored');
  });
  await page.screenshot({path:'art-review/phoenix-awakening/right-corner.png'});
  await page.evaluate(()=>{
    s.command({type:'setClass',classId:'warrior'});
    if(cancelled.count!==0||s.skillFx.phoenix||!s.cameras.main.useBounds||!s.avatar.visible)throw Error('Interrupted phoenix leaked');
  });
  assert.deepEqual(errors,[]);fs.writeFileSync('art-review/phoenix-awakening/report.json',JSON.stringify({...report,frames,errors},null,2));console.log(JSON.stringify({...report,frames,errors}));
}finally{await browser.close()}
