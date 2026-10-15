import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review/infernal-grasp',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('has no frame'))errors.push(m.text())});
try{
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5183'}/?content=real&mode=dev&class=mage`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
    const {GameScene}=await import(url),stats=GameScene.prototype.stats;
    GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
    s.sys.sceneUpdate=()=>{};window.beats=[];window.startZoom=s.cameras.main.zoom;
    const apply=s.applyHits.bind(s);s.applyHits=(skill,index,targets,...rest)=>{
      if(skill.id==='skill_0049')beats.push({index,ms:s.skillFx.grasp.elapsed,targets:targets.length});
      return apply(skill,index,targets,...rest);
    };
  });
  await page.keyboard.press('8');
  await page.evaluate(()=>{s.update(0,17);if(s.player.attacking?.id!=='skill_0049')throw Error('Slot 8 not bound')});
  for(const [label,at]of [['portrait',650],['rise',1450],['hands',2350],['struggle',2600],['command',2940],['crush',3290],['chain',3870],['finish',4380]]){
    await page.evaluate(at=>{let steps=0;while(s.skillFx.grasp&&s.skillFx.grasp.elapsed<at&&steps++<900)s.update(0,1000/60)},at);
    if(label==='hands')assert.equal(await page.evaluate(()=>{
      const fx=s.skillFx.grasp;
      return fx.hands.length>=4&&fx.hands.length<=8&&fx.hands.every(h=>h.sprite.visible&&h.y>400);
    }),true);
    if(label==='struggle')assert.equal(await page.evaluate(()=>{
      s.command({type:'inventoryOpen',open:true});const before=s.skillFx.grasp.elapsed;
      for(let i=0;i<60;i++)s.update(0,1000/60);
      const same=s.skillFx.grasp.elapsed===before;s.command({type:'inventoryOpen',open:false});return same;
    }),true);
    await page.screenshot({path:`art-review/infernal-grasp/${label}.png`});
  }
  await page.evaluate(()=>{window.finishedFx=s.skillFx.grasp;for(let i=0;i<130;i++)s.update(0,1000/60)});
  const report=await page.evaluate(()=>({beats,remaining:finishedFx.count,grasp:s.skillFx.grasp!==null,zoom:s.cameras.main.zoom,startZoom,visible:s.avatar.visible}));
  assert.equal(report.beats.length,8);assert.ok(report.beats.every(b=>b.targets>0));assert.equal(report.remaining,0);
  assert.equal(report.grasp,false);assert.equal(report.zoom,report.startZoom);assert.equal(report.visible,true);
  await page.evaluate(()=>{
    s.player.cooldowns.clear();s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:7,roll:false});
    for(let i=0;i<100;i++)s.update(0,1000/60);
    window.cancelled=s.skillFx.grasp;s.command({type:'setClass',classId:'warrior'});
    if(cancelled.count!==0||s.skillFx.grasp||!s.cameras.main.useBounds)throw Error('Interrupted grasp leaked');
  });
  assert.deepEqual(errors,[]);fs.writeFileSync('art-review/infernal-grasp/report.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,errors}));
}finally{await browser.close()}
