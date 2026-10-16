import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5184';
await fs.mkdir('art-review/reaper', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: 'art-review/reaper', size: { width: 1600, height: 900 } } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${url}/?class=mage&room=1&mobs=2`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0, { timeout: 60000 });
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(resource), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.reviewScene = this; return stats.call(this); };
    window.__lawnStats();
    const scene = window.reviewScene;
    scene.command({ type: 'setMode', mode: 'dev' });
    window.reaperReport = { contacts: [], cues: [], poses: [], portraits: [], maxSouls: 0 };
    const contact = scene.skillFx.contact.bind(scene.skillFx), play = scene.skillFx.play.bind(scene.skillFx);
    scene.skillFx.contact = (skill, index, ctx) => {
      if (skill.id === 'skill_0043') window.reaperReport.contacts.push({ index, time: scene.skillFx.reaperSummon?.elapsed, targets: ctx.targets.length });
      return contact(skill, index, ctx);
    };
    scene.skillFx.play = (name, ctx) => { if (name.startsWith('reaper')) window.reaperReport.cues.push(name); return play(name, ctx); };
    scene.events.on('postupdate', () => {
      const reaper = scene.skillFx.reaperSummon;
      if (!reaper) return;
      const report = window.reaperReport;
      for (const [field, value] of [['poses', Number(reaper.body.frame.name)], ['portraits', Number(reaper.portrait.frame.name)]]) {
        if (report[field].at(-1) !== value) report[field].push(value);
      }
      report.maxSouls = Math.max(report.maxSouls, reaper.souls.size);
    });
  });
  // 真實鍵盤施放，觀察實際傷害回呼與演出，不改怪物或判定結果。
  await page.keyboard.press('7');
  await page.waitForTimeout(5600);
  const report = await page.evaluate(() => window.reaperReport);
  assert.equal(report.cues.filter(name => name === 'reaperCut').length, 1);
  assert.deepEqual(report.contacts.map(hit => hit.index), [0, 1, 2, 3, 4, 5]);
  assert.ok(report.contacts.every(hit => hit.time >= 2580));
  assert.deepEqual(report.poses, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(report.portraits, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(report.maxSouls > 18, '所有怪物都有靈魂，不限 18 隻');
  assert.equal(await page.evaluate(() => window.reviewScene.skillFx.count), 0);
  assert.equal(await page.evaluate(() => !!window.reviewScene.cameras.main._follow), true);

  // 暫停場景，固定時鐘取樣各個鏡頭，讓美術驗收可重現。
  await page.evaluate(() => window.reviewScene.scene.pause());
  for (const [name, time] of [['bow', 300], ['gaze', 850], ['pullback', 1370], ['charge', 2030], ['cut', 2280], ['souls', 2540], ['burst', 2900], ['finish', 3450]]) {
    await page.evaluate(({ time }) => {
      const scene = window.reviewScene, skill = scene.bundle.skills.get('skill_0043');
      scene.skillFx.clear();
      const targets = [...scene.monsters.values()].filter(monster => monster.alive);
      const ctx = scene.fxContext(skill, skill.strikes[0].area, targets, null, 0);
      scene.skillFx.begin(skill, ctx);
      let elapsed = 0;
      for (const [index, strike] of skill.strikes.entries()) {
        if (strike.atMs > time) break;
        scene.skillFx.step(strike.atMs - elapsed);
        scene.skillFx.contact(skill, index, ctx);
        elapsed = strike.atMs;
      }
      scene.skillFx.step(time - elapsed);
    }, { time });
    await page.waitForTimeout(90);
    await page.screenshot({ path: `art-review/reaper/${name}.png` });
  }
  await page.evaluate(() => window.reviewScene.scene.resume());
  await page.waitForTimeout(60);
  const cleanup = await page.evaluate(() => {
    const scene = window.reviewScene;
    scene.skillFx.clear();
    return { count: scene.skillFx.count, follow: !!scene.cameras.main._follow, zoom: scene.cameras.main.zoom };
  });
  assert.equal(cleanup.count, 0);
  assert.equal(cleanup.follow, true);
  // 中途換房會立即清除演出並恢復追蹤；空場景也不能留下鏡頭或物件。
  const room = await page.evaluate(() => {
    const scene = window.reviewScene, skill = scene.bundle.skills.get('skill_0043');
    scene.skillFx.begin(skill, scene.fxContext(skill, skill.strikes[0].area, [], null, 0));
    const next = scene.bundle.rooms.find(room => room.id !== scene.stats().room).id;
    scene.command({ type: 'changeRoom', roomId: next });
    return next;
  });
  await page.waitForFunction(room => window.__lawnStats().room === room, room);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.reviewScene.skillFx.count), 0);
  assert.equal(await page.evaluate(() => !!window.reviewScene.cameras.main._follow), true);
  const empty = await page.evaluate(() => {
    const scene = window.reviewScene, skill = scene.bundle.skills.get('skill_0043');
    const ctx = { ...scene.fxContext(skill, skill.strikes[0].area, [], null, 0), targetsAt: () => [] };
    scene.skillFx.begin(skill, ctx);
    scene.skillFx.step(2500);
    const souls = scene.skillFx.reaperSummon.souls.size;
    scene.skillFx.step(1400);
    return { souls, count: scene.skillFx.count, follow: !!scene.cameras.main._follow };
  });
  assert.deepEqual(empty, { souls: 0, count: 0, follow: true });
  assert.deepEqual(errors, []);
  await fs.writeFile('art-review/reaper/report.json', JSON.stringify({ ...report, cleanup, errors }, null, 2));
  console.log(JSON.stringify({ ...report, cleanup, errors }, null, 2));
} finally { await page.close(); await browser.close(); }
