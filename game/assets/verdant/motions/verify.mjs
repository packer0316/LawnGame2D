import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'export');
const sheet=JSON.parse(fs.readFileSync(path.join(out,'hero-motions.sheet.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(out,'motions.json'),'utf8'));
const atlas=PNG.sync.read(fs.readFileSync(path.join(out,'hero-motions.png')));
assert.equal(manifest.clips.length,12);
assert.equal(sheet.frames.length,96);
assert.deepEqual([...new Set(manifest.clips.map(c=>c.classId))],['warrior','mage','archer','assassin']);
assert.ok(atlas.width<=2048 && atlas.height<=2048);
const byIndex=new Map(sheet.frames.map(f=>[+f.filename,f]));
const pixels=index=>{
  const f=byIndex.get(index),pixels=Buffer.alloc(128*128*4);
  for(let y=0;y<f.frame.h;y++)for(let x=0;x<f.frame.w;x++){
    const src=((f.frame.y+y)*atlas.width+f.frame.x+x)*4;
    const dest=((f.spriteSourceSize.y+y)*128+f.spriteSourceSize.x+x)*4;
    atlas.data.copy(pixels,dest,src,src+4);
  }
  return pixels;
};
const ready=new Map;
for(const c of manifest.clips){
  assert.equal(c.to-c.from+1,8);
  assert.equal(c.durationMs,c.timing.reduce((a,b)=>a+b,0));
  assert.deepEqual(pixels(c.from),pixels(c.to),c.id+' 首尾必須完全相同');
  if(ready.has(c.classId))assert.deepEqual(pixels(c.from),ready.get(c.classId));
  else ready.set(c.classId,pixels(c.from));
  for(const item of c.frames){
    assert.deepEqual(item.root,{x:64,y:120});assert.deepEqual(item.rootMotion,{x:0,y:0});
    const f=byIndex.get(item.frame);assert.ok(f.duration>0);
    assert.deepEqual(f.sourceSize,{w:128,h:128});
    assert.ok(f.spriteSourceSize.x>0 && f.spriteSourceSize.y>0);
    assert.ok(f.spriteSourceSize.x+f.frame.w<128 && f.spriteSourceSize.y+f.frame.h<128);
  }
}
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launch({executablePath,headless:true});
const review=path.resolve(here,'../../../art-review/motions');fs.mkdirSync(review,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(out,'preview.html')).href);
  await page.waitForFunction(()=>document.querySelectorAll('output').length===12 && [...document.querySelectorAll('output')].some(e=>e.textContent!=='1 / 8'));
  assert.equal(await page.locator('article').count(),12);
  for(const button of await page.locator('article button').all())await button.click();
  await page.locator('article input').first().fill('4');
  await page.waitForFunction(()=>document.querySelector('output').textContent==='5 / 8');
  await page.screenshot({path:path.join(review,'desktop.png'),fullPage:true});
  await page.locator('#flip').check();await page.locator('#speed').selectOption('0.5');
  await page.locator('article button').first().click();
  await page.waitForFunction(()=>document.querySelector('output').textContent!=='5 / 8');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(review,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
}finally{await browser.close()}
console.log('PASS: 12 組、96 幀、圖集邊界、固定原點、首尾一致、桌機／手機預覽及播放控制。');
