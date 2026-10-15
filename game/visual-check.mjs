import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

// Run from game/: node visual-check.mjs [http://localhost:5173]
const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await chromium.launch({executablePath, headless: true, args: ['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width:1600,height:900}, deviceScaleFactor:1});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('art-review', {recursive:true});
const base = process.argv[2] || 'http://localhost:5173';
try {
  await page.goto(`${base}/?content=dev`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.waitForTimeout(700);
  const stats = () => page.evaluate(() => window.__lawnStats());
  const initial = await stats();
  assert.equal(initial.room, 1);
  await page.screenshot({path:'art-review/forest.png'});
  const bet = page.locator('.bet .value');
  assert.equal(await bet.innerText(), '1');
  await page.locator('.bet-controls button').last().click();
  await page.waitForFunction(() => document.querySelector('.bet .value').textContent === '2');
  await page.locator('.bet-controls button').first().click();
  for (let i=0; i<4; i++) {
    await page.locator('.class-select button').nth(i).click();
    await page.waitForFunction(index => document.querySelectorAll('.class-select button')[index].getAttribute('aria-pressed') === 'true', i);
    assert.equal(await page.locator('.skill').count(), 3);
    await page.locator('.skill.basic').click();
    await page.waitForTimeout(250);
  }
  await page.locator('.class-select button').first().click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  assert.ok((await stats()).x > initial.x + 80, 'movement must remain functional');
  const beforeJump = await stats();
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  assert.ok((await stats()).y < beforeJump.y - 20, 'jump must remain functional');
  await page.screenshot({path:'art-review/jump.png'});
  await page.waitForTimeout(800);
  await page.keyboard.down('z');
  await page.waitForTimeout(1000);
  await page.keyboard.up('z');
  await page.locator('.skill1').click();
  await page.waitForTimeout(100);
  await page.screenshot({path:'art-review/combat.png'});
  await page.locator('.auto-button').click();
  assert.ok(await page.locator('.toast').isVisible(), 'unfinished auto mode must explain availability');
  await page.locator('.help-toggle').click();
  assert.ok(await page.locator('.help').isVisible());
  await page.locator('.help-toggle').click();
  await page.keyboard.press('F1');
  await page.waitForTimeout(100);
  await page.keyboard.press('F1');
  await page.locator('.room-switch').click();
  await page.locator('.room-list > button').nth(1).click();
  await page.waitForFunction(() => window.__lawnStats?.()?.room === 2);
  await page.waitForTimeout(2200); // 房間切換有既有的兩秒冷卻。
  await page.screenshot({path:'art-review/cave.png'});
  await page.locator('.room-switch').click();
  await page.locator('.room-list > button').first().click();
  await page.waitForFunction(() => window.__lawnStats?.()?.room === 1);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(6500);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);
  await page.screenshot({path:'art-review/forest-expedition.png'});
  for (const [width,height] of [[1920,1080],[768,540],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(300);
    const outside = await page.locator('.hud-bottom button, .hud-top-left button, .hud-top-right button').evaluateAll(elements => elements.filter(el => {
      const r=el.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth+1 || r.bottom > innerHeight+1;
    }).map(el => el.outerHTML));
    assert.deepEqual(outside, [], `HUD buttons must fit ${width}x${height}`);
    await page.screenshot({path:`art-review/layout-${width}.png`});
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(JSON.stringify({result:'PASS',base,checks:['four classes','bet controls','skill buttons','movement','jump','combat','auto availability notice','help','debug toggle','room roundtrip','responsive HUD'],errors,final:await stats()},null,2));
} finally { await browser.close(); }
