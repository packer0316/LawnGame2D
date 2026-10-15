import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [], report = []; page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((e) => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    const catalogUrl = performance.getEntriesByType('resource').find((e) => e.name.includes('/inventory/catalog.ts')).name;
    window.catalog = (await import(catalogUrl)).WEAPONS;
    s.inventoryOpen = true;
    const statsNow = s.stats();
    const canvas = document.querySelector('canvas');
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `translate(${500 - statsNow.screenX * 4}px, ${400 - (statsNow.screenY - 30) * 4}px) scale(4)`;
  });
  await page.addStyleTag({ content: '.hud{visibility:hidden!important}' });
  for (const pose of ['stand', 'run', 'jump', 'fall', 'swing1']) for (const facing of [1, -1]) {
    const checks = await page.evaluate(({ pose, facing }) => {
      const out = [];
      for (const def of catalog) {
        const a = s.avatar; a.stopMotion(); a.setCosmeticWeapon(def); a.play(pose, { restart: true }); a.animator.seek(pose === 'swing1' ? 2 : 0); a.setFacing(facing); a.refresh();
        const rig = { id: def.id, pose, facing, angle: a.cosmeticSprite.angle, size: a.cosmeticSprite.displayHeight, cropped: a.cosmeticSprite.isCropped, sheath: a.scabbardSprite.visible, weapon: a.getIndex(a.cosmeticSprite), body: a.getIndex(a.sprites.get('body')), arm: a.getIndex(a.sprites.get('arm_front')), gripVisible: a.gripOccluder.visible, grip: a.getIndex(a.gripOccluder) };
        out.push(rig);
      }
      return out;
    }, { pose, facing });
    for (const check of checks) {
      if (check.id.startsWith('claw')) { assert.equal(check.size, 24); assert.ok(check.weapon > check.body && check.weapon < check.arm); assert.equal(check.gripVisible, false, 'gauntlet covers hand'); }
      else if (pose !== 'swing1' && check.id.startsWith('sword')) { assert.equal(check.angle, 135); assert.ok(check.sheath && check.cropped, 'blade inside waist scabbard'); assert.ok(check.weapon > check.body && check.weapon < check.arm, 'near hip under front arm'); }
      else if (pose !== 'swing1') { assert.ok(Math.abs(check.angle) <= 6, 'upright staff and bow'); assert.ok(check.weapon < check.body, 'body occludes rear weapon'); }
      else if (check.id.startsWith('bow')) assert.ok(check.weapon < check.body);
      else { assert.ok(check.weapon > check.body && check.weapon < check.arm); assert.ok(check.gripVisible && check.grip > check.weapon, 'fingers occlude front weapon'); }
    }
    report.push(...checks);
    for (const kind of ['sword', 'staff', 'bow', 'claw']) {
      await page.evaluate((kind) => { s.avatar.setCosmeticWeapon(catalog.find((d) => d.id === `${kind}-10`)); s.avatar.refresh(); }, kind);
      await page.waitForTimeout(70);
      await page.screenshot({ path: `art-review/grip-${kind}-${pose}-${facing}.png` });
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/weapon-grip-report.json', JSON.stringify({ checks: report.length, errors, report }, null, 2));
  console.log(JSON.stringify({ checks: report.length, errors }));
} finally { await browser.close(); }
