import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', {recursive:true});
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1600,height:900}}), errors=[], report=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176'}/?content=real&room=1`);
  await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
  await page.evaluate(async()=>{
    const resources=performance.getEntriesByType('resource');
    const {GameScene}=await import(resources.find(e=>e.name.includes('/scenes/GameScene.ts')).name);
    const stats=GameScene.prototype.stats;
    GameScene.prototype.stats=function(){window.s=this;return stats.call(this)};window.__lawnStats();
    window.Monster=(await import(resources.find(e=>e.name.includes('/monster/MonsterActor.ts')).name)).MonsterActor;
    window.normalUpdate=s.sys.sceneUpdate;
  });
  for(let room=1;room<=20;room++){
    const result=await page.evaluate(async room=>{
      s.sys.sceneUpdate=normalUpdate;
      s.server.lastRoomChange=-Infinity;
      if(room!==s.roomId)await s.changeRoom(room,'menu','spawn');
      const roomDef=s.bundle.rooms.find(r=>r.id===room),map=await s.bundle.loadMap(roomDef.mapId);
      const live=[...s.monsters.values()].map(m=>({name:m.def.name,texture:m.sprite.texture.key,frame:m.sprite.frame.name}));
      s.sys.sceneUpdate=()=>{};
      for(const m of s.monsters.values()){m.sprite.setVisible(false);m.label.setVisible(false);m.hpBar?.clear();m.shadow?.setVisible(false)}
      const camera=s.cameras.main;
      camera.stopFollow();camera.centerOn(map.size.w/2,340);
      window.examples=roomDef.lineup.map((id,i)=>{
        const data=s.bundle.monsters.get(id),x=map.size.w/2-210+i*140,y=s.world.groundBelow(x,400)?.y??450;
        const m=new Monster(s,s.world,data.def,data.math,data.sheet,{uid:-100-i,typeId:id,zoneId:map.spawnZones[0].id,seed:1,spawnTime:0,multiplier:2,x,y},{x:0,y:0,w:map.size.w,h:map.size.h},true);
        s.tweens.killTweensOf(m.sprite);m.sprite.setAlpha(1);m.facing=-1;m.enterMode('idle');m.tick(0);return m;
      });
      return {room:s.roomId,live,textures:s.textures.getTextureKeys().filter(k=>k.startsWith('themed-monsters/')),creatures:examples.map(m=>({name:m.def.name,height:m.def.hitbox.h,width:m.def.hitbox.w,scale:m.sprite.scaleX,frame:Number(m.sprite.frame.name)}))};
    },room);
    assert.equal(result.room,room);assert.equal(result.textures.length,1);
    assert.ok(result.live.length>0);assert.ok(result.live.every(m=>m.texture===result.textures[0]));
    result.creatures.forEach((m,i)=>{assert.equal(m.frame,i*12);assert.ok(m.scale>0)});
    await page.waitForTimeout(300);
    if([1,4,7,11,17,20].includes(room))await page.screenshot({path:`art-review/monsters-room-${room}.png`});
    const states=await page.evaluate(()=>examples.map((m,i)=>{
      m.enterMode('move');m.tick(m.animator.duration(i*12+2)*2+1);const walk=Number(m.sprite.frame.name);
      m.onHit(m.x-50);m.tick(81);const hit=Number(m.sprite.frame.name);
      let coins=0;m.kill(()=>coins++);m.tick(0);const dead=Number(m.sprite.frame.name);
      m.tick(2000);m.tick(2000);const gone=m.state;m.destroy();return {walk,hit,dead,gone,coins};
    }));
    states.forEach((v,i)=>{assert.equal(v.walk,i*12+4);assert.equal(v.hit,i*12+7);assert.equal(v.dead,i*12+8);assert.equal(v.gone,'gone');assert.equal(v.coins,1)});
    report.push({...result,states});
  }
  await page.evaluate(async()=>{s.sys.sceneUpdate=normalUpdate;s.server.lastRoomChange=-Infinity;await s.changeRoom(1,'menu','spawn')});
  await page.waitForTimeout(900);
  const live=await page.evaluate(()=>[...s.monsters.values()].map(m=>({alpha:m.sprite.alpha,visible:m.sprite.visible,frame:m.sprite.frame.name})));
  assert.ok(live.length>0&&live.every(m=>m.visible&&m.alpha>.9),'Normal gameplay must display the spawned creatures');
  await page.screenshot({path:'art-review/monsters-live.png'});
  assert.deepEqual(errors,[]);
  fs.writeFileSync('art-review/monsters-report.json',JSON.stringify({rooms:report,errors},null,2));
  console.log(JSON.stringify({rooms:report.length,creatures:report.reduce((n,r)=>n+r.creatures.length,0),animations:report.length*4*4,errors}));
}finally{await browser.close()}
