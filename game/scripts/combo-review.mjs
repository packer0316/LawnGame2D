import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], report = {};
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.command({ type: 'setMode', mode: 'dev' }); s.command({ type: 'setClass', classId: 'warrior' });
    const ground = s.world.groundBelow(600, 440);
    Object.assign(s.player.body, { x: 600, y: ground.y, ground: ground.fh, facing: 1, vx: 0, vy: 0, climb: null }); s.prevPlayer = { x: 600, y: ground.y };
    let n = 0; for (const m of s.monsters.values()) { m.step = () => {}; m.x = n++ < 4 ? 630 + n*5 : 1300; m.y = ground.y; }
    window.rejectHit = false;
    s.server.attack = async req => ({ seq: req.seq, cost: 0, results: rejectHit ? [] : req.targets.map(uid => ({ uid, killed: false, multiplier: 2, payout: 0 })), balance: s.serverBalance, ...(rejectHit ? { error: 'RATE_LIMIT' } : {}) });
    s.press('attack'); s.release('attack');
  });
  await page.waitForFunction(() => Number(document.querySelector('.combo-hud')?.dataset.count) >= 2);
  const first = await page.locator('.combo-hud').getAttribute('data-count');
  assert.equal(await page.locator('.combo-word [data-glyph]').evaluateAll(els => els.map(el => el.dataset.glyph).join('')), 'COMBO');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'art-review/combo-live.png' });
  // Misses/rejected transactions must not add to the combo.
  await page.evaluate(() => { rejectHit = true; s.applyHits(s.bundle.skills.get('skill_0001'), 0, [...s.monsters.values()].slice(0, 2)); });
  await page.waitForTimeout(150); assert.equal(await page.locator('.combo-hud').getAttribute('data-count'), first);
  await page.evaluate(() => { rejectHit = false; s.comboTracker.step(4200); s.applyHits(s.bundle.skills.get('skill_0004'), 0, [...s.monsters.values()].slice(0, 2)); });
  await page.waitForFunction(first => Number(document.querySelector('.combo-hud')?.dataset.count) === Number(first) + 2, first);
  const paused = await page.evaluate(() => { s.command({ type: 'inventoryOpen', open: true }); return s.comboTracker.snapshot(); });
  await page.waitForTimeout(400); assert.deepEqual(await page.evaluate(() => s.comboTracker.snapshot()), paused);
  await page.evaluate(() => s.command({ type: 'inventoryOpen', open: false }));
  report.classes = [];
  for (const classId of ['mage', 'archer', 'assassin']) {
    await page.evaluate(classId => { s.command({ type: 'setClass', classId }); }, classId);
    assert.equal(await page.locator('.combo-hud').count(), 0);
    await page.evaluate(() => s.applyHits(s.bundle.skills.get(s.bundle.classes.get(s.classId).basic), 0, [...s.monsters.values()].slice(0, 3)));
    await page.waitForFunction(() => document.querySelector('.combo-hud')?.dataset.count === '3'); report.classes.push(classId);
  }
  // Verify old in-flight replies cannot resurrect a combo after switching class.
  await page.evaluate(() => {
    s.server.attack = req => new Promise(resolve => { window.resolveLate = () => resolve({ seq: req.seq, cost: 0, results: req.targets.map(uid => ({ uid, killed: false, multiplier: 2, payout: 0 })), balance: s.serverBalance }); });
    s.applyHits(s.bundle.skills.get('skill_0031'), 0, [...s.monsters.values()].slice(0, 3));
    s.command({ type: 'setClass', classId: 'warrior' }); resolveLate();
  });
  await page.waitForTimeout(100); assert.equal(await page.locator('.combo-hud').count(), 0);
  report.layouts = [];
  for (const [count, viewport] of [[28,{ width:1600,height:900 }], [128,{width:1920,height:1080}], [99999,{width:390,height:844}], [9999,{width:320,height:740}], [78,{width:844,height:390}]]) {
    await page.setViewportSize(viewport);
    await page.evaluate(count => { s.comboTracker.reset(); s.comboTracker.hit(count); s.emitHud({}); }, count);
    await page.waitForTimeout(30);
    const punchRight = await page.locator('.combo-number').evaluate(el => el.getBoundingClientRect().right);
    assert.ok(punchRight <= viewport.width, 'Pulse must remain inside the viewport');
    await page.waitForTimeout(350);
    const layout = await page.locator('.combo-hud').evaluate(el => {
      const b = el.getBoundingClientRect(), digits = el.querySelector('.combo-number').getBoundingClientRect();
      return { x:b.x, y:b.y, right:b.right, bottom:b.bottom, digitsRight:digits.right, screen:innerWidth, pointerEvents:getComputedStyle(el).pointerEvents };
    });
    assert.ok((layout.x + layout.right) / 2 > viewport.width*.65); assert.ok(layout.digitsRight <= viewport.width); assert.ok(layout.y > 50 && layout.bottom < viewport.height-60); assert.equal(layout.pointerEvents, 'none');
    await page.screenshot({ path: `art-review/combo-${count}-${viewport.width}.png` }); report.layouts.push(layout);
  }
  await page.evaluate(() => { s.comboTracker.step(s.comboTracker.snapshot().remainingMs); s.emitHud({}); });
  await page.locator('.combo-expired').waitFor();
  await page.waitForTimeout(750); assert.equal(await page.locator('.combo-hud').count(), 0);
  assert.deepEqual(errors, []); report.errors = errors;
  fs.writeFileSync('art-review/combo-report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser.close(); }
