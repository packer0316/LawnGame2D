import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.command({ type: 'setMode', mode: 'dev' });
    window.records = []; window.requests = []; window.lastWave = [];
    // Keep monsters alive while exercising the real player clock and hit-stop.
    s.server.attack = async req => { requests.push(req); return { seq: req.seq, cost: 0, results: req.targets.map(uid => ({ uid, killed: false, multiplier: 2, payout: 0 })), balance: s.serverBalance }; };
    const land = s.skillFx.landRain.bind(s.skillFx), contact = s.skillFx.contact.bind(s.skillFx);
    s.skillFx.landRain = (skill, index) => {
      lastWave = s.skillFx.rainWaves.get(`${skill.id}:${index}`) ?? [];
      if (!lastWave.length || lastWave.some(r => r.contacted)) throw new Error('rain impacted before strike');
      return land(skill, index);
    };
    s.skillFx.contact = (skill, index, ctx) => {
      const grounded = lastWave.filter(r => r.options.surface);
      if (!grounded.length) throw new Error('missing ground contacts');
      for (const r of grounded) {
        if (r.weapon.y !== r.options.surface.y || r.impact?.getData('rainFrame') !== 0) throw new Error('ground and monster impact clocks differ');
      }
      records.push({ id: skill.id, index, groundContacts: grounded.length, targets: ctx.targets.length, skillMs: s.player.state.elapsed, strikeMs: skill.strikes[index].atMs });
      return contact(skill, index, ctx);
    };
  });
  const casts = [];
  for (const id of ['skill_0041','skill_0044','skill_0023']) {
    await page.evaluate(id => {
      const skill = s.bundle.skills.get(id);
      s.command({ type: 'setClass', classId: skill.classId }); s.skillFx.clear();
      const ground = s.world.groundBelow(600, 440);
      Object.assign(s.player.body, { x: 600, y: ground.y, ground: ground.fh, facing: 1, vx: 0, vy: 0, climb: null });
      s.prevPlayer = { x: 600, y: ground.y };
      let n = 0;
      for (const m of s.monsters.values()) { m.step = () => {}; m.x = 660 + n++ % 6 * 15; m.y = ground.y; }
      records = []; requests = [];
      s.slowMoMs = 300;
      const action = `skill${s.bundle.classes.get(skill.classId).skills.indexOf(id) + 1}`;
      s.press(action); s.release(action);
    }, id);
    await page.waitForFunction(() => s.skillFx.rainWaves.size > 0);
    // The inventory pause cannot advance rain while the player clock is stopped.
    const paused = await page.evaluate(() => { s.inventoryOpen = true; return [...s.skillFx.rains].map(r => r.clock.elapsed); });
    await page.waitForTimeout(180);
    assert.deepEqual(await page.evaluate(() => [...s.skillFx.rains].map(r => r.clock.elapsed)), paused);
    await page.evaluate(() => { s.inventoryOpen = false; });
    await page.waitForFunction(() => records.length >= 1);
    await page.screenshot({ path: `art-review/rain-${id}-synchronized.png` });
    await page.waitForFunction(id => records.length === s.bundle.skills.get(id).strikes.length, id);
    await page.waitForTimeout(1600);
    const result = await page.evaluate(() => ({ records, requests: requests.length, remaining: s.skillFx.rains.size, waves: s.skillFx.rainWaves.size }));
    assert.equal(result.requests, result.records.length, 'one original attack request per strike');
    assert.equal(result.remaining, 0); assert.equal(result.waves, 0);
    for (const row of result.records) { assert.ok(row.skillMs >= row.strikeMs && row.skillMs < row.strikeMs + 17); assert.ok(row.targets > 0); }
    casts.push(result);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/rain-sync-report.json', JSON.stringify({ casts, errors }, null, 2));
  console.log(JSON.stringify({ casts, errors }));
} finally { await browser.close(); }
