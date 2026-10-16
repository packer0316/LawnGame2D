import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review/idle', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5183'}/?content=real&class=warrior&mode=dev`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.sys.sceneUpdate = () => {};
    const { AvatarView } = await import(new URL('../avatar/AvatarView.ts', url).href);
    const v = s.cameras.main.worldView;
    window.back = s.add.rectangle(v.centerX, v.centerY, v.width, v.height, 0x172b30).setDepth(10000);
    window.clones = [null, 'ninja-1', 'hood-1'].map((outfit, i) => {
      const a = new AvatarView(s, s.avatar.content);
      a.setLoadout({ weapon: s.avatar.weapon }); a.setCosmeticWeapon(s.avatar.cosmetic);
      a.setOutfit(outfit); a.setLit(false); a.play('stand'); a.tick(0);
      a.setScale(4).setPosition(v.centerX + (i - 1) * 250, v.centerY + 110).setDepth(10001);
      return a;
    });
  });
  const report = [];
  for (const time of [0, 500, 1100, 1800, 2500]) {
    report.push(await page.evaluate(time => clones.map(a => {
      a.idleBody.elapsed = time; a.tick(0);
      return { visible: a.idleBody.visible, vertices: [...a.idleBody.vertices], hand: [a.cosmeticSprite.x, a.cosmeticSprite.y], feet: [a.x, a.y] };
    }), time));
    await page.waitForTimeout(80);
    await page.screenshot({ path: `art-review/idle/pose-${time}.png` });
  }
  for (let i = 0; i < 3; i++) {
    assert.ok(report[0][i].visible);
    assert.notDeepEqual(report[0][i].vertices, report[2][i].vertices);
    assert.deepEqual(report[0][i].hand, report[3][i].hand);
    assert.deepEqual(report[0][i].feet, report[3][i].feet);
  }
  const states = await page.evaluate(() => clones.map(a => {
    const before = [...a.idleBody.vertices]; a.tick(0);
    const frozen = JSON.stringify(before) === JSON.stringify(a.idleBody.vertices);
    a.play('run'); a.tick(16);
    const run = !a.idleBody.visible && a.sprites.get('body').visible;
    a.play('stand'); a.tick(16);
    const idle = a.idleBody.visible && !a.sprites.get('body').visible;
    const started = a.playMotion('slash_horizontal'); a.tick(16);
    const motion = started && a.inMotion && !a.idleBody.visible;
    a.stopMotion(); a.play('stand'); a.tick(16); a.setFill(0xffffff); a.setFill(null); a.setLit(true); a.setLit(false);
    a.setFacing(1).setScale(-4, 4);
    return { frozen, run, idle, motion };
  }));
  assert.ok(states.every(s => Object.values(s).every(Boolean)));
  await page.waitForTimeout(80); await page.screenshot({ path: 'art-review/idle/facing-right.png' });
  const equipped = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { WEAPONS } = await import(new URL('../inventory/catalog.ts', url).href);
    return clones.every(a => ['sword', 'staff', 'bow', 'claw'].every(kind => {
      a.setCosmeticWeapon(WEAPONS.find(w => w.kind === kind)); a.play('stand'); a.tick(16);
      const pos = [a.cosmeticSprite.x, a.cosmeticSprite.y]; a.tick(1000);
      const pinned = pos[0] === a.cosmeticSprite.x && pos[1] === a.cosmeticSprite.y;
      const started = a.playMotion('slash_horizontal'); a.tick(16);
      const motion = started && !a.idleBody.visible;
      a.stopMotion(); a.play('stand'); a.tick(16);
      return pinned && motion && a.idleBody.visible;
    }));
  });
  assert.ok(equipped);
  await page.evaluate(() => { clones.forEach(a => a.destroy()); back.destroy(); for (let i = 0; i < 100; i++) s.update(0, 16); });
  await page.waitForTimeout(80); await page.screenshot({ path: 'art-review/idle/in-game.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ states, equipped, errors }));
} finally { await browser.close(); }
