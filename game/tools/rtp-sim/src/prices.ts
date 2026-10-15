import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClassFileVersioned,
  MapDefFile,
  MonsterMathFileVersioned,
  PRICE_EXPONENT,
  SkillFileVersioned,
  contentPaths,
  expectedHits,
  suggestFullTargets,
  suggestPrice,
  type DensityModel,
  type SkillDef,
} from '@lawn/shared';

/**
 * 技能價格計算（SPEC §3.1「技能押注倍數」）：
 * 1. 從正式地圖量出怪物密度（可站立長度上每像素幾隻、整房幾隻）
 * 2. 每個技能預期打中幾隻次 H → 價格 N = round(H^0.7)、1–20，大絕招 20、普攻 1
 * 3. 印出比較表（每隻次單價越低 CP 值越高）；加 --write 寫回 content/class/skills.json
 *
 * 用法：npm run prices -w @lawn/rtp-sim [-- --write]
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const contentDir = path.join(repoRoot, 'content');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(contentDir, p), 'utf8'));
const write = process.argv.includes('--write');
const RTP = 0.96;

// 1) 量密度
const manifest = read(contentPaths.manifest);
let monsterCount = 0;
let walkable = 0;
const spawnWeights: Record<string, number> = {};
for (const id of manifest.maps as string[]) {
  const map = MapDefFile.migrate(read(contentPaths.map(id)));
  for (const zone of map.spawnZones) {
    monsterCount += zone.maxCount;
    const total = zone.pool.reduce((sum, e) => sum + e.weight, 0);
    for (const entry of zone.pool) spawnWeights[entry.mobId] = (spawnWeights[entry.mobId] ?? 0) + (entry.weight / total) * zone.maxCount;
  }
  for (const f of map.footholds) walkable += f.points.at(-1)![0] - f.points[0]![0];
}
const rooms = (manifest.maps as string[]).length;
const density: DensityModel = { perPixel: monsterCount / walkable, tierHeight: 128, tiers: 3, roomTotal: monsterCount / rooms };

// 怪物的平均 1/倍率（預期擊殺數用）：依出現比例加權，區間倍率取中間值
const monsters = MonsterMathFileVersioned.migrate(read(contentPaths.monstersMath)).monsters;
let weightSum = 0;
let inverseSum = 0;
for (const m of monsters) {
  if (m.tier === 'boss') continue;
  const w = spawnWeights[m.id] ?? 0;
  const mult = typeof m.multiplier === 'number' ? m.multiplier : (m.multiplier[0] + m.multiplier[1]) / 2;
  weightSum += w;
  inverseSum += w / Math.max(2, mult);
}
const avgInverseMultiplier = inverseSum / weightSum;

// 2) 算價格
const skillsFile = path.join(contentDir, contentPaths.skills);
const skills = SkillFileVersioned.migrate(read(contentPaths.skills)).skills;
const classes = ClassFileVersioned.migrate(read(contentPaths.classes)).classes;
const priced = new Map<string, { price: number; fullTargets: number; hits: number }>();
for (const skill of skills) {
  priced.set(skill.id, { price: suggestPrice(skill, density), fullTargets: suggestFullTargets(skill, density), hits: expectedHits(skill, density) });
}

// 3) 比較表
const castMs = (skill: SkillDef) => Math.max(skill.strikes.at(-1)!.atMs + 120, skill.cancelFromMs);
console.log(`密度：每像素 ${density.perPixel.toFixed(4)} 隻、每房 ${density.roomTotal.toFixed(1)} 隻；怪物平均 1/倍率 ${avgInverseMultiplier.toFixed(3)}；價格 = 預期打中隻次^${PRICE_EXPONENT}（1–20）\n`);
console.log('| 職業 | 技能 | 刀數 | 預期打中（隻次） | 價格 | 滿價隻數／刀 | 每隻次單價 | 一次預期擊殺 | 放一次（秒） | 每秒擊殺 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const c of classes) {
  const ids = [c.basic, ...(c.secondary ? [c.secondary] : []), ...c.skills.filter((id) => id !== c.secondary)];
  for (const id of ids) {
    const skill = skills.find((s) => s.id === id)!;
    const p = priced.get(id)!;
    const kills = RTP * p.price * avgInverseMultiplier;
    const seconds = castMs(skill) / 1000;
    const label = id === c.basic ? `${skill.name}（Z）` : id === c.secondary ? `${skill.name}（X）` : skill.ultimate ? `**${skill.name}**` : skill.name;
    console.log(`| ${c.name} | ${label} | ${skill.strikes.length} | ${p.hits.toFixed(1)} | ×${p.price} | ${p.fullTargets} | ${(p.price / p.hits).toFixed(2)} | ${kills.toFixed(2)} | ${seconds.toFixed(2)} | ${(kills / seconds).toFixed(2)} |`);
  }
}

// 4) 寫回（保留原本的排版與換行，只加／改 price、fullTargets，拿掉 unlockBet）
if (write) {
  const raw = fs.readFileSync(skillsFile, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const out: string[] = [];
  let current: string | null = null;
  for (const line of raw.split(nl)) {
    const id = /^\s*"id": "(skill_\d+)"/.exec(line)?.[1];
    if (id) current = id;
    if (/^\s*"(unlockBet|price|fullTargets)":/.test(line)) continue;
    out.push(line);
    if (current && /^\s*"cooldownSec":/.test(line)) {
      const indent = /^(\s*)/.exec(line)![1];
      const p = priced.get(current)!;
      out.push(`${indent}"price": ${p.price},`, `${indent}"fullTargets": ${p.fullTargets},`);
    }
  }
  const text = out.join(nl);
  JSON.parse(text);
  fs.writeFileSync(skillsFile, text);
  console.log(`\n已寫入 ${path.relative(repoRoot, skillsFile)}`);
}
