import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const report = {};
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&class=warrior&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  const attach = () => page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((e) => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.command({ type: 'setMode', mode: 'dev' });
  });
  await attach();
  await page.getByRole('button', { name: '開啟背包', exact: true }).click();
  await page.getByRole('dialog', { name: '行囊與武器工坊' }).waitFor();
  assert.equal(await page.locator('.inventory-item').count(), 4);
  await page.getByRole('button', { name: '領取展示收藏（40 款）' }).click();
  assert.equal(await page.locator('.inventory-item').count(), 40);
  await page.getByRole('button', { name: '外觀圖鑑 40 款' }).click();
  await page.screenshot({ path: 'art-review/inventory-catalog.png' });
  await page.getByRole('button', { name: /我的行囊/ }).click();
  await page.getByRole('button', { name: '玉龍御劍，強化 0 次', exact: true }).click();
  await page.getByRole('button', { name: '裝備至劍士', exact: true }).click();
  assert.equal(await page.locator('.inventory-sell').isDisabled(), true);
  await page.screenshot({ path: 'art-review/inventory-workshop.png' });
  const merchantFrames = new Set();
  for (let i = 0; i < 7; i++) { merchantFrames.add(await page.locator('.merchant-sprite').getAttribute('data-frame')); await page.waitForTimeout(350); }
  assert.ok(merchantFrames.size >= 3); report.merchantFrames = [...merchantFrames];
  const upgrade = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((e) => e.name.includes('/inventory/model.ts')).name;
    const { inventoryAction } = await import(url);
    // Deterministic success through the real server transaction, without altering combat RNG.
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => { a.fill(0); return a; };
    try { s.command({ type: 'inventory', action: { type: 'upgrade', uid: s.inventoryState.inventory.equipped.warrior, rate: 60 } }); }
    finally { crypto.getRandomValues = original; }
    return s.inventoryState;
  });
  assert.equal(upgrade.feedback.kind, 'success');
  assert.equal(upgrade.inventory.items.find((w) => w.uid === upgrade.inventory.equipped.warrior).bonusValue, 1000);
  await page.screenshot({ path: 'art-review/inventory-upgrade.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.inventory-window').count(), 0);
  report.equipped = [];
  for (const [classId, id] of [['warrior', 'sword-10'], ['mage', 'staff-10'], ['archer', 'bow-10'], ['assassin', 'claw-10']]) {
    const details = await page.evaluate(({ classId, id }) => {
      s.command({ type: 'setClass', classId });
      const item = s.inventoryState.inventory.items.find((w) => w.definitionId === id);
      s.command({ type: 'inventory', action: { type: 'equip', uid: item.uid } });
      return { key: s.avatar.cosmeticSprite.texture.key, visible: s.avatar.cosmeticSprite.visible, id: s.avatar.cosmetic.id };
    }, { classId, id });
    assert.ok(details.visible); assert.equal(details.id, id); report.equipped.push(details);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `art-review/inventory-equipped-${classId}.png` });
    await page.keyboard.press('z'); await page.waitForTimeout(180);
    const skill = await page.evaluate(() => ({ motion: s.avatar.inMotion, visible: s.avatar.cosmeticSprite.visible, baked: s.avatar.motionSprite.visible }));
    assert.ok(skill.visible); assert.equal(skill.baked, false);
    await page.screenshot({ path: `art-review/inventory-action-${classId}.png` });
    await page.waitForTimeout(1400);
  }
  await page.keyboard.press('i');
  await page.getByRole('button', { name: '旅人鐵劍，強化 0 次', exact: true }).click();
  const before = await page.evaluate(() => s.server.inventorySnapshot().inventory.items.length);
  const balance = await page.evaluate(() => s.server.balance);
  await page.locator('.inventory-sell').click();
  await page.getByRole('button', { name: '確認出售 · 1,000' }).click();
  assert.equal(await page.evaluate(() => s.server.balance), balance + 1000);
  assert.equal(await page.evaluate(() => s.server.inventorySnapshot().inventory.items.length), before - 1);
  await page.getByRole('button', { name: '購買 90% 卷軸' }).click();
  assert.equal(await page.evaluate(() => s.server.balance), balance + 700);
  const saved = await page.evaluate(() => localStorage.getItem('lawn.balance.profile.v1'));
  await page.reload(); await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0); await attach();
  assert.equal(await page.evaluate(() => localStorage.getItem('lawn.balance.profile.v1')), saved);
  await page.keyboard.press('i');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  report.mobile = await page.locator('.inventory-window').evaluate((e) => ({ width: e.clientWidth, scrollWidth: e.scrollWidth }));
  assert.equal(report.mobile.width, report.mobile.scrollWidth);
  await page.screenshot({ path: 'art-review/inventory-mobile.png' });
  report.errors = errors; assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/inventory-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
