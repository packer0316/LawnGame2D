import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&mode=dev&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.command({ type: 'setMode', mode: 'dev' });
  });
  const coverage = await page.evaluate(async () => {
    const { PIXEL_ICONS, SKILL_DESCRIPTION, ICON_ATLASES } = await import('/src/skillArt.ts');
    for (const skill of s.bundle.skills.values()) if (!PIXEL_ICONS[skill.id] || !SKILL_DESCRIPTION[skill.id]) throw new Error(`unmapped ${skill.id}`);
    for (const atlas of Object.values(ICON_ATLASES)) {
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = atlas.url; });
    }
    return { skills: s.bundle.skills.size, icons: Object.keys(PIXEL_ICONS).length, uniqueCells: new Set(Object.values(PIXEL_ICONS).map(i => `${i.url}:${i.col}:${i.row}`)).size };
  });
  assert.equal(coverage.icons, coverage.uniqueCells);
  const classes = [['warrior','劍士'],['mage','法師'],['archer','弓箭手'],['assassin','刺客']];
  let inspected = 0;
  for (const [id, label] of classes) {
    await page.locator('.class-select button').filter({ hasText: label }).click();
    await page.waitForFunction(id => s.classId === id, id);
    await page.mouse.move(10, 500); await page.waitForTimeout(180);
    assert.equal(await page.locator('[role=tooltip]').count(), 0);
    assert.equal(await page.locator('.class-select button:has(.pixel-icon)').count(), 4);
    for (const button of await page.locator('button.hotbar-slot, button.skill').all()) {
      const label = await button.getAttribute('aria-label');
      assert.ok(label);
      assert.equal(await button.getAttribute('title'), null);
      assert.ok(!((await button.innerText()).includes(label)), 'skill name only appears in tooltip');
      assert.equal(await button.locator('.pixel-icon').count(), 1);
      await button.hover(); await page.waitForTimeout(150);
      const tip = page.locator('[role=tooltip]');
      assert.equal(await tip.locator('strong').innerText(), label);
      assert.ok((await tip.locator('p').innerText()).length > 10);
      const box = await tip.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 1600);
      inspected++;
    }
    await page.mouse.move(10, 500); await page.waitForTimeout(180);
    await page.locator('.hud-bottom-stack').screenshot({ path: `art-review/skill-icons-${id}.png` });
    if (id === 'warrior') {
      const first = page.locator('button.hotbar-slot').first();
      await first.hover(); await page.mouse.down(); await page.waitForTimeout(150);
      const overlay = await first.evaluate(el => {
        const style = getComputedStyle(el, '::after');
        return { width: parseFloat(style.width), height: parseFloat(style.height), expectedWidth: el.clientWidth,
          expectedHeight: el.clientHeight, top: style.top, left: style.left, color: style.backgroundColor };
      });
      assert.equal(overlay.width, overlay.expectedWidth); assert.equal(overlay.height, overlay.expectedHeight);
      assert.equal(overlay.top, '0px'); assert.equal(overlay.left, '0px');
      assert.equal(overlay.color, 'rgba(0, 0, 0, 0.4)');
      await page.locator('.hud-bottom-stack').screenshot({ path: 'art-review/skill-icons-warrior-pressed.png' });
      await page.mouse.move(10, 500); await page.mouse.up(); await page.waitForTimeout(150);
    }
  }
  // Focus/Escape work even while cooling; focus does not cast the skill.
  const first = page.locator('button.hotbar-slot').first();
  await first.focus(); await page.waitForTimeout(100);
  assert.equal(await page.locator('[role=tooltip]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role=tooltip]').count(), 0);
  await first.click(); await page.waitForTimeout(700); await page.mouse.move(10, 500); await first.hover();
  assert.equal(await first.getAttribute('aria-disabled'), 'true');
  assert.ok((await page.locator('[role=tooltip]').innerText()).includes('冷卻中'));
  await page.screenshot({ path: 'art-review/skill-icons-tooltip.png' });
  for (const width of [1920, 680, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(1, 1); await page.waitForTimeout(180);
    const overflow = await page.locator('.hud-bottom-stack').evaluate(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; });
    assert.equal(overflow, false, `dock fits ${width}`);
    const last = page.locator('button.hotbar-slot').last(); await last.hover(); await page.waitForTimeout(180);
    const box = await page.locator('[role=tooltip]').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900);
    if (width === 375) await page.screenshot({ path: 'art-review/skill-icons-mobile.png' });
  }
  assert.deepEqual(errors, []);
  const report = { coverage, inspectedButtons: inspected, viewports: [1600,1920,680,375,320], errors };
  fs.writeFileSync('art-review/skill-icons-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
