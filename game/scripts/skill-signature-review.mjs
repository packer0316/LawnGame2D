import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review',{recursive:true});
const baseUrl=process.env.LAWN_REVIEW_URL??'http://127.0.0.1:5176';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${baseUrl}/?content=real&mode=dev&class=warrior&room=1`);
 await page.waitForFunction(()=>window.__lawnStats?.()?.monsters>0);
 await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').find(e=>e.name.includes('/scenes/GameScene.ts')).name;const {GameScene}=await import(url),stats=GameScene.prototype.stats;GameScene.prototype.stats=function(){window.s=this;return stats.call(this);};window.__lawnStats();window.seen={};s.events.on('postupdate',()=>{for(const o of s.skillFx.objects){const k=o.texture?.key;if(k?.startsWith('skill-sequence-')){window.seen[k]??=[];if(!seen[k].includes(+o.frame.name))seen[k].push(+o.frame.name);}}});});
 for(const [classId,slot,at,label]of [['warrior',3,1150,'earth'],['warrior',4,1150,'thrust'],['warrior',5,620,'dragon'],['mage',1,680,'lightning'],['mage',7,1710,'souls'],['assassin',1,1320,'fuma']]){
  await page.evaluate(id=>{s.command({type:'setClass',classId:id});s.player.cooldowns.clear();const ground=s.world.groundBelow(440,400);Object.assign(s.player.body,{x:440,y:ground.y,vx:0,vy:0,ground:ground.fh,climb:null,facing:1});s.prevPlayer={x:440,y:ground.y};},classId);
  await page.keyboard.press(String(slot));await page.waitForTimeout(at);
  await page.screenshot({path:`art-review/v4-${label}.png`});
  await page.waitForTimeout(3000);
  assert.equal(await page.evaluate(()=>s.skillFx.count),0,`${label} cleaned up`);
 }
 const result=await page.evaluate(()=>({frames:seen,stats:s.stats()}));
 for(const name of ['earth','dragon','lightning','soul'])assert.deepEqual([...result.frames[`skill-sequence-${name}`]].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
 const small=await page.evaluate(()=>{const sk=s.bundle.skills.get('skill_0031');s.launchProjectile(sk,0,sk.strikes[0]);return s.projectiles.at(-1).sprite.displayWidth;});
 assert.equal(small,48);
 assert.deepEqual(errors,[]);fs.writeFileSync('art-review/v4-report.json',JSON.stringify({result,small,errors},null,2));console.log(JSON.stringify({result,small,errors},null,2));
}finally{await browser.close();}
