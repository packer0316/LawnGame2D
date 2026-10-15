import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('art-review/moon-execution',{recursive:true});
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
    s.command({type:'setClass',classId:'assassin'});
    window.normalUpdate=s.sys.sceneUpdate;s.sys.sceneUpdate=()=>{};
    window.beats=[];
    const apply=s.applyHits.bind(s);s.applyHits=(skill,index,targets,...rest)=>{
      if(skill.id==='skill_0048')beats.push({index,ms:s.skillFx.moon.elapsed,targets:targets.length});
      return apply(skill,index,targets,...rest);
    };
    window.startZoom=s.cameras.main.zoom;
  });
  await page.keyboard.press('7');
  await page.evaluate(()=>{s.update(0,17);if(s.player.attacking?.id!=='skill_0048')throw Error('Seventh skill did not start');});
  for(const [label,at]of [['seal',420],['eyes',790],['moon-split',1220],['shadows-first',1820],['shadows-second',2150],['shadows-third',2530],['sheath',2940],['hits',3500],['finish',3930]]){
    await page.evaluate(at=>{let steps=0;while(s.skillFx.moon&&s.skillFx.moon.elapsed<at&&steps++<700)s.update(0,1000/60);},at);
    if(label==='moon-split')assert.equal(await page.evaluate(()=>s.skillFx.moon.moon.displayHeight*s.cameras.main.zoom>s.cameras.main.height*1.9),true);
    if(label==='shadows-third')assert.equal(await page.evaluate(()=>{
      const fx=s.skillFx.moon;
      return fx.shadows.length>0&&fx.shadows.length<=6&&fx.shadows.some(s=>s.clone.visible)
        &&fx.shadows.every(s=>s.clone.texture.key==='moon-execution-shadow')&&s.avatar.visible;
    }),true);
    if(label==='sheath')assert.equal(await page.evaluate(()=>s.skillFx.moon.shadows.every(s=>!s.clone.visible&&!s.slash.visible)&&!s.avatar.visible),true);
    await page.screenshot({path:`art-review/moon-execution/${label}.png`});
  }
  await page.evaluate(()=>{for(let i=0;i<100;i++)s.update(0,1000/60);});
  const report=await page.evaluate(()=>({beats,visible:s.avatar.visible,cinematic:s.skillFx.moon!==null,zoom:s.cameras.main.zoom,startZoom,attacking:s.player.attacking?.id??null}));
  assert.equal(report.beats.length,8);assert.ok(report.beats.every(b=>b.targets>0&&b.ms>=3000));
  assert.equal(report.visible,true);assert.equal(report.cinematic,false);assert.equal(report.attacking,null);assert.equal(report.zoom,report.startZoom);
  // Switching class during the close-up must restore visibility, camera and remove all owned objects.
  await page.evaluate(()=>{
    s.player.cooldowns.clear();
    s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:6,roll:false});
    if(!s.skillFx.moon)throw Error('Interruption test did not start cinematic');
    for(let i=0;i<110;i++)s.update(0,1000/60);
    if(!s.avatar.visible)throw Error('Expected real avatar visible while commanding shadows');
    s.command({type:'setClass',classId:'mage'});
  });
  assert.equal(await page.evaluate(()=>s.avatar.visible&&!s.skillFx.moon),true);
  for(const [outfit,row]of [['ninja-1',1],['hood-1',2]]){
    await page.evaluate(outfit=>{
      s.command({type:'setClass',classId:'assassin'});
      s.server.manageInventory({type:'equipOutfit',outfitId:outfit});s.player.cooldowns.clear();
      s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:6,roll:false});
      while(s.skillFx.moon.elapsed<1800)s.update(0,1000/60);
    },outfit);
    assert.equal(await page.evaluate(()=>s.avatar.bodyArt.path),`outfit-${outfit.split('-')[0]}-base`);
    const paused=await page.evaluate(()=>{
      s.command({type:'inventoryOpen',open:true});const before=s.skillFx.moon.elapsed;
      for(let i=0;i<60;i++)s.update(0,1000/60);
      const after=s.skillFx.moon.elapsed;s.command({type:'inventoryOpen',open:false});return before===after;
    });assert.equal(paused,true);
    await page.evaluate(()=>{while(s.skillFx.moon.elapsed<2940)s.update(0,1000/60);});
    assert.equal(await page.evaluate(()=>Number(s.skillFx.moon.sheath.frame.name)),row*4+2);
    await page.screenshot({path:`art-review/moon-execution/${outfit}-sheath.png`});
    await page.evaluate(()=>s.command({type:'setClass',classId:'mage'}));
    assert.equal(await page.evaluate(()=>s.avatar.visible&&s.cameras.main.useBounds&&!s.skillFx.moon),true);
  }
  await page.evaluate(()=>{
    s.command({type:'setClass',classId:'assassin'});s.player.cooldowns.clear();
    s.player.step(s.world,{x:0,up:false,down:false,jumpPressed:false,jumpHeld:false,attack:false,secondary:false,skill:6,roll:false});
    while(s.skillFx.moon.elapsed<1800)s.update(0,1000/60);
    s.scene.stop();s.game.scene.processQueue();
    if(s.skillFx.moon)throw Error('Scene shutdown left cinematic alive');
  });
  assert.deepEqual(errors,[]);fs.writeFileSync('art-review/moon-execution/report.json',JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,errors}));
}finally{await browser.close()}
