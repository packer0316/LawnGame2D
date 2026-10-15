import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('art-review', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5176'}/?content=real&class=archer&room=1`);
  await page.waitForFunction(() => window.__lawnStats?.()?.monsters > 0);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/scenes/GameScene.ts')).name;
    const { GameScene } = await import(url), stats = GameScene.prototype.stats;
    GameScene.prototype.stats = function () { window.s = this; return stats.call(this); }; window.__lawnStats();
    s.command({ type: 'setMode', mode: 'dev' });
    for (const m of s.monsters.values()) m.step = () => {};
    window.frames = {}; window.phases = new Set(); window.clipped = 0;
    s.events.on('postupdate', () => {
      for (const rain of s.skillFx.rains) {
        phases.add(rain.weapon.getData('rainPhase'));
        for (const mesh of [rain.weapon, rain.impact]) if (mesh) {
          const key = mesh.texture.key; frames[key] ??= new Set(); frames[key].add(mesh.getData('rainFrame'));
          const surface = rain.options.surface;
          if (surface) for (let i = 0; i < mesh.vertices.length; i += 4) {
            if (mesh.vertices[i + 1] + mesh.y > surface.y + mesh.vertices[i] * surface.slope + .001) throw new Error('rain escaped terrain clip');
          }
        }
        if (rain.weapon.y > (rain.options.surface?.y ?? Infinity)) clipped++;
      }
    });
  });
  const report = [];
  for (const [id, name] of [['skill_0041','swordRain'], ['skill_0044','screenArrowRain'], ['skill_0023','arrowRain']]) {
    await page.evaluate(({ id, name }) => {
      s.skillFx.clear(); frames = {}; phases = new Set(); clipped = 0;
      const skill = s.bundle.skills.get(id), ctx = s.fxContext(skill, skill.strikes[0].area, [], null, 0);
      s.skillFx.play(name, ctx);
    }, { id, name });
    await page.waitForTimeout(530);
    await page.screenshot({ path: `art-review/rain-${id}-impact.png` });
    await page.waitForTimeout(260);
    await page.screenshot({ path: `art-review/rain-${id}-embedded.png` });
    await page.waitForTimeout(1600);
    const result = await page.evaluate(() => ({ frames: Object.fromEntries(Object.entries(frames).map(([k,v]) => [k,[...v].sort()])), phases: [...phases].filter(Boolean), clipped, rains: s.skillFx.rains.size }));
    assert.equal(result.rains, 0, 'natural lifecycle cleanup');
    assert.ok(result.clipped > 0, 'weapon physically sinks beyond floor');
    for (const phase of ['fall','embed','hold','dissolve']) assert.ok(result.phases.includes(phase));
    const kind = id === 'skill_0041' ? 'sword' : 'arrow';
    for (const phase of ['Fall','Ground']) assert.deepEqual(result.frames[`skill-sequence-${kind}${phase}`], [0,1,2,3,4,5,6,7]);
    report.push({ id, ...result });
  }
  // Clear both delayed and mid-flight rain; none may respawn after a room change.
  await page.evaluate(() => {
    const skill = s.bundle.skills.get('skill_0041'), ctx = s.fxContext(skill, skill.strikes[0].area, [], null, 0);
    s.skillFx.play('swordRain', ctx); s.skillFx.clear();
  });
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => s.skillFx.count), 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync('art-review/rain-report.json', JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors }));
} finally { await browser.close(); }
