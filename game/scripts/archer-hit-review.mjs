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
    window.hits = []; window.frames = {}; window.activeClass = '';
    const fx = s.skillFx;
    const archer = fx.archerContact.bind(fx), gold = fx.goldContact.bind(fx), impact = fx.kit.classImpact.bind(fx.kit), burst = fx.kit.burst.bind(fx.kit);
    fx.archerContact = (p, angle, power, fire, particles) => { hits.push({ type: 'archer', angle, fire, p }); return archer(p, angle, power, fire, particles); };
    fx.goldContact = (p, confirmed) => { if (confirmed) hits.push({ type: 'gold', p }); return gold(p, confirmed); };
    fx.kit.classImpact = (...args) => { hits.push({ type: args[0] }); return impact(...args); };
    fx.kit.burst = (...args) => { if (activeClass === 'assassinMelee') hits.push({ type: 'melee' }); return burst(...args); };
    s.events.on('postupdate', () => { for (const o of fx.objects) { const k = o.texture?.key; if (!k?.startsWith('skill-sequence-archer')) continue; frames[k] ??= []; if (!frames[k].includes(+o.frame.name)) frames[k].push(+o.frame.name); } });
    // Presentation probe keeps test monsters alive; economy/combat RNG is not replaced in production.
    s.server.attack = async req => ({ seq: req.seq, cost: 0, results: req.targets.map(uid => ({ uid, killed: false, multiplier: 2, payout: 0 })), balance: s.serverBalance });
  });
  const coverage = await page.evaluate(() => {
    const out = [];
    for (const skill of s.bundle.skills.values()) for (let index = 0; index < skill.strikes.length; index++) {
      const ctx = s.fxContext(skill, skill.strikes[index].area, [], null, 0);
      ctx.targets = Array.from({ length: 23 }, (_, i) => ({ x: ctx.view.x + 60 + i * 22, y: ctx.view.y + ctx.view.h / 2 }));
      activeClass = skill.classId === 'assassin' && !['skill_0031','skill_0032','skill_0035','skill_0046'].includes(skill.id) ? 'assassinMelee' : skill.classId;
      s.skillFx.clear(); hits = []; s.skillFx.contact(skill, index, ctx);
      out.push({ id: skill.id, index, targets: 23, effects: hits.length });
      s.skillFx.clear(); hits = []; ctx.targets = []; s.skillFx.contact(skill, index, ctx);
      if (hits.length) throw new Error('empty hit created a contact effect');
    }
    activeClass = ''; s.skillFx.clear(); return out;
  });
  for (const row of coverage) assert.equal(row.effects, row.targets, `${row.id}/${row.index} every target`);
  const casts = [];
  for (const facing of [1, -1]) for (const id of ['skill_0021','skill_0022','skill_0023','skill_0024','skill_0025','skill_0026','skill_0044','skill_0045']) {
    await page.evaluate(({ id, facing }) => {
      s.skillFx.clear(); for (const p of s.projectiles) p.sprite.destroy(); s.projectiles = [];
      const ground = s.world.groundBelow(700, 400);
      Object.assign(s.player.body, { x: 700, y: ground.y, ground: ground.fh, facing, vx: 0, vy: 0, climb: null }); s.prevPlayer = { x: 700, y: ground.y };
      let i = 0;
      for (const m of s.monsters.values()) { m.step = () => {}; m.x = 700 + facing * (110 + (i % 4) * 35); m.y = ground.y - (i % 3) * 3; i++; }
      window.skill = s.bundle.skills.get(id); hits = []; frames = {};
    }, { id, facing });
    await page.waitForTimeout(250);
    for (let index = 0; index < await page.evaluate(() => skill.strikes.length); index++) {
      await page.evaluate(index => s.onStrike(skill, index), index);
      await page.waitForTimeout(100);
      if (index === 0) await page.screenshot({ path: `art-review/archer-hit-${id}-${facing}.png` });
      await page.waitForTimeout(450);
    }
    const result = await page.evaluate(() => ({ hits, frames }));
    assert.ok(result.hits.some(h => h.type === 'archer'), `${id} produces actual hits`);
    assert.ok(result.hits.every(h => h.type === 'archer'), 'archer does not reuse assassin impact');
    const fire = id === 'skill_0026' || id === 'skill_0045';
    const key = `skill-sequence-${fire ? 'archerFireHit' : 'archerHit'}`;
    assert.deepEqual(result.frames[key]?.sort((a,b)=>a-b), [0,1,2,3,4,5,6,7]);
    if (id === 'skill_0023' || id === 'skill_0044') assert.ok(result.hits.every(h => h.angle === Math.PI / 2));
    else if (['skill_0021','skill_0024','skill_0026'].includes(id)) assert.ok(result.hits.every(h => Math.sign(Math.cos(h.angle)) === facing));
    casts.push({ id, facing, count: result.hits.length, frames: result.frames });
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => s.skillFx.clear());
  assert.equal(await page.evaluate(() => s.skillFx.count), 0);
  assert.deepEqual(errors, []);
  const report = { strikeCoverage: coverage.length, skills: new Set(coverage.map(x => x.id)).size, checkedTargets: coverage.length * 23, casts, errors };
  fs.writeFileSync('art-review/archer-hit-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
