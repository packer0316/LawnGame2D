import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', {recursive:true});
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.text().includes('has no frame') || m.text().includes('Failed to process file')) errors.push(m.text()); });
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5183'}/?mode=dev&class=warrior`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  // Let the room's entrance fade finish before freezing gameplay for the art capture.
  await page.waitForTimeout(400);
  const shown = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.sys.sceneUpdate = () => {};
    s.pickups.clear();
    const view = s.cameras.main.worldView;
    window.lootTarget = { x: view.centerX, y: view.centerY };
    s.pickups.target = () => lootTarget;
    [10, 60, 90].forEach((rate, i) => {
      const x = view.centerX + (i - 1) * 110;
      const ground = s.world.groundBelow(x, view.bottom - 180);
      if (!ground) throw Error('Missing floor');
      s.pickups.item({ kind: 'scroll', rate }, x, ground.y - 40, ground.y);
      s.pickups.items.at(-1).vx = 0;
    });
    for (let i = 0; i < 110; i++) s.pickups.update(16, false);
    return s.pickups.items.map(p => ({ frame: p.sprite.frame.name, texture: p.sprite.texture.key, width: p.sprite.displayWidth, height: p.sprite.displayHeight, pixelWidth:p.sprite.width,pixelHeight:p.sprite.height, phase: p.phase }));
  });
  assert.equal(shown.length, 3);
  assert.deepEqual(shown.map(p => p.frame), ['10', '60', '90']);
  assert.ok(shown.every(p=>p.texture==='loot-scrolls-v4-pixel'));
  assert.ok(shown.every(p=>Math.max(p.pixelWidth,p.pixelHeight)===18));
  assert.ok(shown.every(p=>p.width>25 && p.height>25));
  assert.ok(shown.every(p => p.phase === 'float' && Math.abs(Math.max(p.width, p.height) - 34) < 0.01));
  await page.screenshot({ path: 'art-review/scroll-loot-v4-map.png' });
  const result = await page.evaluate(() => {
    const before = s.pickups.items.map(p => [p.x, p.y]);
    s.pickups.update(1000, true);
    const frozen = JSON.stringify(before) === JSON.stringify(s.pickups.items.map(p => [p.x, p.y]));
    let collected = 0;
    s.pickups.onCollect = () => collected++;
    for (let i = 0; i < 400; i++) s.pickups.update(16, false);
    return { frozen, collected, remaining: s.pickups.count };
  });
  assert.deepEqual(result, { frozen: true, collected: 3, remaining: 0 });
  await page.evaluate(()=>s.command({type:'inventoryOpen',open:true}));
  await page.locator('.inventory-scrolls .scroll-art').first().waitFor();
  const bagArt=await page.locator('.scroll-art').evaluateAll(elements=>elements.map(el=>({
    label:el.getAttribute('aria-label'),view:el.getAttribute('viewBox'),
    href:el.querySelector('image')?.getAttribute('href'),width:el.getBoundingClientRect().width,
  })));
  assert.equal(bagArt.length,6);
  assert.ok(bagArt.every(icon=>icon.href.includes('loot-scrolls-v4.png')));
  assert.equal(new Set(bagArt.map(icon=>icon.view)).size,3);
  assert.deepEqual(bagArt.slice(0,3).map(icon=>icon.width),[64,64,64]);
  assert.deepEqual(bagArt.slice(3).map(icon=>icon.width),[36,36,36]);
  await page.evaluate(async()=>{
    const icon=document.querySelector('.scroll-art image'),image=new Image();
    image.src=icon.getAttribute('href');await image.decode();
  });
  for(const rate of [10,60,90]){
    await page.locator(`.inventory-scrolls .scroll-${rate}`).click();
    assert.equal(await page.locator(`.inventory-scrolls .scroll-${rate}`).getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('.upgrade').innerText(),new RegExp(`${rate}%`));
  }
  await page.locator('.inventory-scrolls').screenshot({path:'art-review/scroll-bag-v4-desktop.png'});
  await page.locator('.merchant-shop').screenshot({path:'art-review/scroll-merchant-v4.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.inventory-scrolls').scrollIntoViewIfNeeded();
  const mobile=await page.locator('.inventory-scrolls .scroll-art').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().width));
  assert.deepEqual(mobile,[42,42,42]);
  await page.locator('.inventory-scrolls').screenshot({path:'art-review/scroll-bag-v4-mobile.png'});
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ shown, ...result,bagArt,mobile, errors }));
} catch(error) {
  await page.screenshot({path:'art-review/scroll-loot-v4-error.png'});
  console.error(JSON.stringify({errors,body:await page.locator('body').innerText()}));
  throw error;
} finally { await browser.close(); }
