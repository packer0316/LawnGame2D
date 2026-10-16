import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5184';
await fs.mkdir('art-review/mobile-panels', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('lawn.ui.layout.v1', 'mobile');
  if (localStorage.getItem('lawn.autoReport')) return;
  const start = Date.now() - 3600000;
  localStorage.setItem('lawn.autoReport', JSON.stringify({ running: false, startedAt: start, endedAt: start + 3600000, stopReason: '手動停止', startBalance: 100000, balance: 112340, high: 120000, low: 98340,
    points: Array.from({ length: 61 }, (_, i) => [i * 60000, 100000 + i * 205 + Math.sin(i) * 4000]),
    items: [
      ...Array.from({ length: 8 }, (_, i) => ({ kind: 'weapon', id: `sword-${i + 1}`, name: i === 0 ? '旅人鐵劍' : `珍藏森林武器 ${i + 1}`, count: i + 1, times: [start + 90000 * i] })),
      ...[10, 60, 90].map(rate => ({ kind: 'scroll', id: `scroll-${rate}`, name: `${rate}% 卷軸`, count: 12, times: [start + 300000] })),
    ] }));
});
const button = name => page.getByRole('button', { name, exact: true });
const onScreen = async selector => {
  const result = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    let clipped = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (style.display !== 'contents' && /(auto|scroll|hidden)/.test(style.overflowY) && (rect.y < bounds.y - 1 || rect.bottom > bounds.bottom + 1)) clipped = true;
    }
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, inside: !clipped && rect.x >= -1 && rect.y >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, hit: !!hit && (hit === element || element.contains(hit)) };
  });
  assert.ok(result.inside && result.width > 0 && result.height > 0 && result.hit, `${selector} is clipped or covered: ${JSON.stringify(result)}`);
  return result;
};
const noOverflow = async selector => {
  assert.ok(await page.locator(selector).evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${selector} overflows horizontally`);
};
try {
  await page.goto(`${url}/?class=warrior&room=1`);
  await page.locator('.hud-mobile').waitFor({ timeout: 60000 });
  await page.evaluate(async () => {
    const sceneUrl = performance.getEntriesByType('resource').find(entry => entry.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(sceneUrl), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.reviewScene = this; return stats.call(this); };
    window.__lawnStats();
    reviewScene.command({ type: 'inventory', action: { type: 'grantAllWeapons' } });
    reviewScene.command({ type: 'inventory', action: { type: 'grantScrolls', count: 5 } });
  });
  for (const [width, height] of [[390, 844], [320, 568], [544, 284], [844, 390], [932, 430], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await button('開啟背包').tap();
    await page.locator('.inventory-mobile').waitFor();
    await onScreen('.inventory-close');
    await noOverflow('.inventory-window');
    await page.screenshot({ path: `art-review/mobile-panels/bag-${width}-${height}.png` });
    await page.getByRole('button', { name: '旅人鐵劍，強化 0 次', exact: true }).tap();
    assert.equal(await page.locator('.inventory-window').getAttribute('data-mobile-view'), 'detail');
    await onScreen('.inventory-equip-row .inventory-primary');
    const forge = await onScreen('.inventory-forge .upgrade');
    await onScreen('.inventory-scrolls button[aria-pressed="true"]');
    await noOverflow('.inventory-detail');
    await page.screenshot({ path: `art-review/mobile-panels/detail-${width}-${height}.png` });
    await button('商店').tap();
    await button('購買 90% 卷軸').scrollIntoViewIfNeeded();
    await onScreen('.merchant-shop button[aria-label="購買 90% 卷軸"]');
    await noOverflow('.inventory-merchant');
    await page.screenshot({ path: `art-review/mobile-panels/shop-${width}-${height}.png` });
    await button('收藏').tap();
    await button('蒼影忍裝').tap();
    await onScreen('.inventory-outfit-detail .inventory-primary');
    await button('關閉背包').tap();

    await button('掛機紀錄').tap();
    await onScreen('.auto-report-heading button');
    await noOverflow('.mobile-report');
    await page.screenshot({ path: `art-review/mobile-panels/report-${width}-${height}.png` });
    await button('財產曲線').tap();
    await page.waitForTimeout(100);
    const chart = await onScreen('.mobile-report .auto-report-chart');
    assert.ok(chart.height >= 100 && chart.width >= 250);
    assert.ok(await page.locator('.mobile-report .auto-report-chart').evaluate(svg => Math.abs(svg.viewBox.baseVal.width - svg.clientWidth) < 2));
    await page.getByRole('group', { name: '時間級距' }).getByRole('button', { name: '5分', exact: true }).tap();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `art-review/mobile-panels/chart-${width}-${height}.png` });
    await page.locator('.auto-report-mobile-nav button').nth(2).tap();
    assert.equal(await page.locator('.auto-report-items li').count(), 11);
    await noOverflow('.auto-report-loot');
    await page.screenshot({ path: `art-review/mobile-panels/loot-${width}-${height}.png` });
    await page.locator('.auto-report-items li').last().scrollIntoViewIfNeeded();
    await onScreen('.auto-report-heading button');
    await button('關閉掛機收益').tap();
    layouts.push({ width, height, forge, chart });
  }

  await page.setViewportSize({ width: 544, height: 284 });
  await button('開啟背包').tap();
  await button('旅人鐵劍，強化 0 次').tap();
  await button('裝備至劍士').tap();
  await button('卸下外觀').waitFor();
  await button('商店').tap();
  assert.ok(await page.locator('.inventory-sell').isDisabled());
  await button('換裝／強化').tap();
  await button('卸下外觀').tap();
  const before = await page.evaluate(() => reviewScene.server.inventorySnapshot());
  await page.evaluate(() => { crypto.getRandomValues = array => { array.fill(0); return array; }; });
  await button('使用 60% 卷軸').tap();
  await page.locator('.forge-ritual').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('.forge-ritual')?.dataset.outcome === 'success', undefined, { timeout: 15000 });
  assert.ok(await page.locator('.forge-caption').evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; }));
  await page.screenshot({ path: 'art-review/mobile-panels/forge-result.png' });
  await page.locator('.forge-ritual').waitFor({ state: 'detached', timeout: 15000 });
  const after = await page.evaluate(() => reviewScene.server.inventorySnapshot());
  assert.equal(after.inventory.scrolls[60], before.inventory.scrolls[60] - 1);
  assert.equal(after.inventory.items[0].successes, before.inventory.items[0].successes + 1);
  await onScreen('.inventory-forge .upgrade');
  await button('商店').tap();
  await button('購買 90% 卷軸').tap();
  await page.waitForFunction(count => reviewScene.server.inventorySnapshot().inventory.scrolls[90] === count + 1, after.inventory.scrolls[90]);
  await page.locator('.inventory-sell').tap();
  await button('保留').tap();
  await button('關閉背包').tap();

  await button('掛機紀錄').tap();
  await button('財產曲線').tap();
  await button('放大財產變化').tap();
  await onScreen('.auto-report-zoom-tools > button');
  await onScreen('.auto-report-zoom .auto-report-chart');
  await page.screenshot({ path: 'art-review/mobile-panels/chart-zoom.png' });
  await page.keyboard.press('Escape');
  await page.locator('.auto-report-zoom').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.mobile-report').count(), 1);
  await button('關閉掛機收益').tap();
  await button('設定').tap();
  await button('電腦版本').tap();
  await button('關閉設定').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await button('開啟背包').click();
  assert.equal(await page.locator('.inventory-mobile').count(), 0);
  await onScreen('.inventory-forge .upgrade');
  await page.screenshot({ path: 'art-review/mobile-panels/desktop-bag.png' });
  await button('關閉背包').click();
  await page.locator('.auto-report-button').click();
  assert.equal(await page.locator('.mobile-report').count(), 0);
  assert.ok(await page.locator('.auto-report-chart').isVisible());
  assert.ok(await page.locator('.auto-report-items').isVisible());
  assert.deepEqual(errors, []);
  await fs.writeFile('art-review/mobile-panels/report.json', JSON.stringify({ layouts, errors, interactions: 'passed' }, null, 2));
  console.log(JSON.stringify({ viewports: layouts.length, errors, interactions: 'passed' }));
} finally { await browser.close(); }
