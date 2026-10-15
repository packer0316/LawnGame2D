import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = [], errors = [];
try {
  for (const [outcome, viewport, reduced] of [
    ['success', { width: 1600, height: 1000 }, false],
    ['failed', { width: 1600, height: 1000 }, false],
    ['destroyed', { width: 1600, height: 1000 }, false],
    ['success', { width: 390, height: 844 }, true],
    ['failed', { width: 844, height: 390 }, false],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5183'}/?content=real&class=warrior&room=1`);
    await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
    await page.keyboard.press('i');
    await page.waitForFunction(() => window.__lawnSfx?.buffers.has('chime'));
    await page.evaluate(async outcome => {
      const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
      const { GameScene } = await import(url), stats = GameScene.prototype.stats;
      GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
      window.before = s.server.inventorySnapshot(); window.commits = 0; window.randomCalls = 0; window.sounds = [];
      window.__lawnSfx.onPlay = name => { if (name.startsWith('forge:')) sounds.push(name); };
      const original = s.server.manageInventory.bind(s.server);
      s.server.manageInventory = (...args) => { if (args[0].type === 'upgrade') window.commits++; return original(...args); };
      crypto.getRandomValues = a => { a.fill(outcome === 'success' || (outcome === 'destroyed' && window.randomCalls > 0) ? 0 : 0xffffffff); window.randomCalls++; return a; };
    }, outcome);
    await page.locator('.upgrade').scrollIntoViewIfNeeded();
    await page.locator('.upgrade').evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'charge');
    await page.waitForTimeout(350);
    const neutral = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      const portal = document.querySelector('.forge-ritual'), box = document.querySelector('.inventory-showcase').getBoundingClientRect();
      const sequence = document.querySelector('.forge-sequence');
      return { commits, calls: randomCalls, unchanged: JSON.stringify(before) === JSON.stringify(s.server.inventorySnapshot()),
        outcome: portal.dataset.outcome, sequence: sequence.dataset.sequence, progress: sequence.dataset.progress,
        hidden: getComputedStyle(document.querySelector('.inventory-body')).visibility,
        aligned: Math.abs(parseFloat(portal.style.left) - box.left - box.width / 2) < 1 && Math.abs(parseFloat(portal.style.top) - box.top - box.height / 2) < 1,
        sounds: [...sounds], audio: __lawnSfx.ready, parent: portal.parentElement.tagName };
    });
    assert.equal(neutral.commits, 0); assert.equal(neutral.calls, 0); assert.ok(neutral.unchanged);
    assert.equal(neutral.outcome, undefined); assert.equal(neutral.sequence, 'charge');
    assert.equal(neutral.hidden, 'visible'); assert.ok(neutral.aligned); assert.equal(neutral.parent, 'BODY');
    assert.deepEqual(neutral.sounds, ['forge:charge']); assert.ok(neutral.audio);
    await page.keyboard.press('Escape'); await page.keyboard.press('i'); await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.forge-sequence').getAttribute('data-progress'), neutral.progress);
    await page.screenshot({ path: `art-review/forge-inline-${outcome}-${viewport.width}-charge.png` });
    await page.evaluate(() => { delete document.hidden; });
    await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'result');
    await page.waitForTimeout(170);
    const result = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      return { commits, outcome: document.querySelector('.forge-ritual').dataset.outcome,
        state: s.server.inventorySnapshot(), before, sounds: [...sounds] };
    });
    assert.equal(result.commits, 1); assert.equal(result.outcome, outcome);
    assert.deepEqual(result.sounds, ['forge:charge', outcome === 'success' ? 'forge:success' : outcome === 'destroyed' ? 'forge:destroyed' : 'forge:failure']);
    assert.equal(result.state.inventory.scrolls[60], result.before.inventory.scrolls[60] - 1);
    const uid = result.before.inventory.items[0].uid, weapon = result.state.inventory.items.find(w => w.uid === uid);
    if (outcome === 'destroyed') assert.equal(weapon, undefined);
    else { assert.equal(weapon.slotsLeft, 6); assert.equal(weapon.successes, outcome === 'success' ? 1 : 0); }
    await page.screenshot({ path: `art-review/forge-inline-${outcome}-${viewport.width}-result.png` });
    await page.evaluate(() => { delete document.hidden; });
    await page.waitForFunction(() => !document.querySelector('.forge-ritual'));
    assert.equal(await page.locator('.inventory-window').count(), 1);
    assert.equal(await page.locator('.inventory-body').getAttribute('inert'), null);
    assert.ok(await page.locator('.merchant-dialogue').textContent());
    // Repeated upgrades remain usable, and zero volume must not create voices.
    if (outcome === 'success' && !reduced) {
      await page.evaluate(() => { __lawnSfx.setVolume(0); window.sounds = []; window.voiceCount = __lawnSfx.voices; });
      await page.locator('.upgrade').click();
      await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.phase === 'result');
      assert.ok(await page.evaluate(() => __lawnSfx.voices <= voiceCount));
      await page.waitForFunction(() => !document.querySelector('.forge-ritual'));
      assert.equal(await page.evaluate(() => commits), 2);
      assert.equal(await page.evaluate(() => s.server.inventorySnapshot().inventory.scrolls[60]), result.before.inventory.scrolls[60] - 2);
    }
    report.push({ outcome, viewport, reduced, sounds: result.sounds, aligned: neutral.aligned, commits: result.commits });
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/forge-inline-report.json', JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors }));
} finally { await browser.close(); }
