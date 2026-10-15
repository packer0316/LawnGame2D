import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function attach(){await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;
  const {GameScene}=await import(url),stats=GameScene.prototype.stats;
  GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
})}
try{
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176'}/?content=real&mode=dev`);await attach();
  await page.locator('.inventory-open-button').click();
  await page.getByRole('button',{name:'套服',exact:true}).click();
  assert.equal(await page.locator('.inventory-grid .inventory-item').count(),1);
  assert.equal(await page.getByRole('button',{name:/使用.*卷軸/}).count(),0);
  await page.getByRole('button',{name:'穿上套服',exact:true}).click();
  await page.waitForFunction(()=>s.inventoryState.inventory.equippedOutfit==='ninja-1');
  assert.match(await page.locator('.inventory-outfit-slot').innerText(),/蒼影忍裝/);
  await page.screenshot({path:'art-review/outfit-inventory.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'art-review/outfit-inventory-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'關閉背包',exact:true}).click();
  await page.setViewportSize({width:1600,height:1000});
  await page.reload();await attach();
  assert.equal(await page.evaluate(()=>s.inventoryState.inventory.equippedOutfit),'ninja-1');
  const checks=await page.evaluate(async()=>{
    const a=s.avatar,normal=s.sys.sceneUpdate;s.sys.sceneUpdate=()=>{};
    let baseFrames=0,motionFrames=0,cosmeticFrames=0;
    const list=[];
    for(const classId of ['warrior','mage','archer','assassin']){
      s.command({type:'setClass',classId});a.stopMotion();
      if(a.outfit!=='ninja-1')throw Error('Class switch lost costume');
      for(const facing of [-1,1])for(const [tag,info] of s.bundle.base.sheet.tags){
        a.setFacing(facing);a.play(tag,{restart:true});
        for(let i=0;i<=info.to-info.from;i++){
          a.animator.seek(i);a.tick(0);const sprite=a.sprites.get('body');
          if(sprite.texture.key!=='outfit-ninja-base'||sprite.frame.name!==`body|${info.from+i}`||!sprite.visible)throw Error(`Missing ${classId}/${tag}/${i}`);
          baseFrames++;
        }
      }
      const item=s.inventoryState.inventory.items.find(w=>w.definitionId===({warrior:'sword-1',mage:'staff-1',archer:'bow-1',assassin:'claw-1'}[classId]));
      s.server.manageInventory({type:'equip',uid:item.uid});
      for(const [tag,info]of s.bundle.base.sheet.tags){
        a.play(tag,{restart:true});for(let i=0;i<=info.to-info.from;i++){
          a.animator.seek(i);a.tick(0);
          if(a.sprites.get('body').texture.key!=='outfit-ninja-base'||!a.cosmeticSprite.visible)throw Error('Cosmetic/body disappeared');
          if(a.gripOccluder.visible&&a.gripOccluder.texture.key!=='outfit-ninja-base')throw Error('Old costume grip');
          cosmeticFrames++;
        }
      }
      list.push({classId,outfit:a.outfit,weapon:a.cosmetic.id});
      s.server.manageInventory({type:'unequip',classId});
    }
    for(const [tag,info]of a.motionAnimator.sheet.tags){
      if(!a.playMotion(tag))throw Error(`Cannot play ${tag}`);
      for(let i=0;i<=info.to-info.from;i++){
        a.motionAnimator.seek(i);a.tick(0);
        if(a.motionSprite.texture.key!=='outfit-ninja-motions'||a.motionSprite.frame.name!==String(info.from+i))throw Error(`Old/missing motion ${tag}`);
        if(a.motionFrame.key!=='outfit-ninja-motions')throw Error('Old costume afterimage');
        motionFrames++;
      }
      a.stopMotion();
    }
    s.command({type:'setClass',classId:'warrior'});a.play('stand',{restart:true});a.tick(0);s.sys.sceneUpdate=normal;
    return {baseFrames,motionFrames,cosmeticFrames,classes:list};
  });
  await page.waitForTimeout(300);await page.screenshot({path:'art-review/outfit-live.png'});
  await page.locator('.inventory-open-button').click();await page.getByRole('button',{name:'套服',exact:true}).click();
  await page.getByRole('button',{name:'卸下套服・恢復原裝',exact:true}).click();
  await page.waitForFunction(()=>s.inventoryState.inventory.equippedOutfit===null);
  await page.evaluate(()=>{s.avatar.stopMotion();s.avatar.play('stand',{restart:true});s.avatar.tick(0)});
  assert.equal(await page.evaluate(()=>s.avatar.sprites.get('body').texture.key===s.bundle.base.path),true);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('art-review/outfit-report.json',JSON.stringify({...checks,errors},null,2));console.log(JSON.stringify({...checks,errors}));
}finally{await browser.close()}
