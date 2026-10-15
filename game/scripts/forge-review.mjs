import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = [], errors = [];
try {
  for (const outcome of ['success', 'failed', 'destroyed']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&class=warrior&room=1`);
    await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
    await page.evaluate(async outcome => {
      const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
      const { GameScene } = await import(url), stats = GameScene.prototype.stats;
      GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
      s.command({ type: 'inventoryOpen', open: true });
      window.before = s.server.inventorySnapshot(); window.commits = 0; window.randomCalls = 0;
      const original = s.server.manageInventory.bind(s.server);
      s.server.manageInventory = (...args) => { if (args[0].type === 'upgrade') window.commits++; return original(...args); };
      crypto.getRandomValues = a => { a.fill(outcome === 'success' || (outcome === 'destroyed' && window.randomCalls > 0) ? 0 : 0xffffffff); window.randomCalls++; return a; };
      window.seenFrames = { charge: [], success: [], failure: [] };
      window.interpolatedFrames = { charge: new Set(), success: new Set(), failure: new Set() };
      new MutationObserver(() => {
        const sprite = document.querySelector('.forge-sequence');
        if (sprite) {
          const frames = seenFrames[sprite.dataset.sequence], frame = Number(sprite.dataset.frame); if (!frames.includes(frame)) frames.push(frame);
          if (Number(sprite.dataset.blend) > 0 && Number(sprite.dataset.blend) < 1) interpolatedFrames[sprite.dataset.sequence].add(sprite.dataset.progress);
        }
      }).observe(document.body, { subtree: true, attributes: true, childList: true });
    }, outcome);
    await page.locator('.inventory-scrolls .scroll-art').first().waitFor();
    assert.equal(await page.locator('.inventory-scrolls .scroll-art').count(), 3);
    if (outcome === 'success') await page.screenshot({ path: 'art-review/forge-scrolls.png' });
    // Dispatch both clicks in one turn to exercise the duplicate-transaction guard.
    await page.locator('.upgrade').evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'charge');
    if (outcome === 'success') {
      const pausedFrame = await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); return document.querySelector('.forge-sequence').dataset.frame; });
      await page.waitForTimeout(450);
      assert.equal(await page.locator('.forge-sequence').getAttribute('data-frame'), pausedFrame);
      assert.equal(await page.evaluate(() => commits), 0);
      await page.evaluate(() => { delete document.hidden; });
    }
    await page.keyboard.press('Escape'); await page.keyboard.press('i'); await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);
    const neutral = await page.evaluate(() => ({ commits, calls: randomCalls, unchanged: JSON.stringify(before) === JSON.stringify(s.server.inventorySnapshot()), outcome: document.querySelector('.forge-ritual').dataset.outcome, sequence: document.querySelector('.forge-sequence').dataset.sequence, focusInside: !!document.activeElement.closest('.forge-ritual'), hidden: getComputedStyle(document.querySelector('.inventory-body')).visibility }));
    assert.equal(neutral.commits, 0); assert.equal(neutral.calls, 0); assert.ok(neutral.unchanged); assert.equal(neutral.outcome, undefined); assert.equal(neutral.sequence, 'charge'); assert.equal(neutral.hidden, 'hidden'); assert.ok(neutral.focusInside);
    await page.screenshot({ path: `art-review/forge-${outcome}-charge.png` });
    await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'result');
    await page.waitForTimeout(450);
    await page.screenshot({ path: `art-review/forge-${outcome}-reveal.png` });
    await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'done');
    const result = await page.evaluate(() => ({ commits, outcome: document.querySelector('.forge-ritual').dataset.outcome, state: s.server.inventorySnapshot(), before, frames: seenFrames, interpolation: Object.fromEntries(Object.entries(interpolatedFrames).map(([key, frames]) => [key, frames.size])) }));
    assert.equal(result.commits, 1); assert.equal(result.outcome, outcome); assert.equal(result.state.inventory.scrolls[60], result.before.inventory.scrolls[60] - 1);
    const uid = result.before.inventory.items[0].uid, weapon = result.state.inventory.items.find(w => w.uid === uid);
    if (outcome === 'destroyed') assert.equal(weapon, undefined);
    else { assert.equal(weapon.slotsLeft, 6); assert.equal(weapon.successes, outcome === 'success' ? 1 : 0); }
    assert.equal(result.frames.charge.length, 12); assert.equal(result.frames[outcome === 'success' ? 'success' : 'failure'].length, 12);
    assert.ok(result.interpolation.charge > 60, 'Charge must render intermediate light fields, not just twelve held frames');
    assert.ok(result.interpolation[outcome === 'success' ? 'success' : 'failure'] > 35, 'Result must interpolate too');
    await page.locator('.forge-footer button').click(); assert.equal(await page.locator('.forge-ritual').count(), 0);
    report.push({ outcome, commits: result.commits, frames: result.frames, interpolation: result.interpolation });
    if (outcome === 'success') {
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('.upgrade').click();
        await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'charge');
        const size = await page.locator('.forge-ritual').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth })); assert.equal(size.width, size.scroll);
        await page.screenshot({ path: `art-review/forge-mobile-${viewport.width}.png` });
        await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'done');
        await page.locator('.forge-footer button').click();
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/forge-report.json', JSON.stringify({ report, errors }, null, 2)); console.log(JSON.stringify({ report, errors }));
} finally { await browser.close(); }
