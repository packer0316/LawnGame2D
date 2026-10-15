import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapDefFile, MonsterMathFileVersioned, SkillFileVersioned, contentPaths } from '@lawn/shared';
import { simulate } from './simulate';

/**
 * RTP 蒙地卡羅模擬（SPEC §9 M3：模擬 10⁸ 刀，RTP 誤差 < 0.1%）。
 * 用法：npm run sim -w @lawn/rtp-sim -- [--strikes 100000000] [--rtp 0.96] [--content <資料夾>] [--seed 1]
 * 預設讀 content/（有 manifest 時），否則讀 game/dev-content/。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const repoRoot = path.resolve(here, '../../../..');
const defaultContent = fs.existsSync(path.join(repoRoot, 'content', contentPaths.manifest)) ? path.join(repoRoot, 'content') : path.join(repoRoot, 'game', 'dev-content');
const contentDir = path.resolve(arg('content', defaultContent));
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(contentDir, p), 'utf8'));

const strikes = Number(arg('strikes', '100000000'));
const rtp = Number(arg('rtp', '0.96'));
const seed = Number(arg('seed', '1'));
const tolerance = Number(arg('tolerance', '0.001'));

const monsters = MonsterMathFileVersioned.migrate(read(contentPaths.monstersMath)).monsters;
const skills = SkillFileVersioned.migrate(read(contentPaths.skills)).skills;

// 生怪比例：所有地圖、所有生怪區的 pool 權重 × 數量上限
const spawnWeights: Record<string, number> = {};
const manifest = read(contentPaths.manifest);
for (const id of manifest.maps as string[]) {
  const map = MapDefFile.migrate(read(contentPaths.map(id)));
  for (const zone of map.spawnZones) {
    const total = zone.pool.reduce((sum, e) => sum + e.weight, 0);
    for (const entry of zone.pool) spawnWeights[entry.mobId] = (spawnWeights[entry.mobId] ?? 0) + (entry.weight / total) * zone.maxCount;
  }
}

console.log(`內容：${contentDir}`);
console.log(`模擬 ${strikes.toLocaleString()} 刀，目標 RTP ${(rtp * 100).toFixed(2)}%，技能 ${skills.length} 個，怪物 ${monsters.length} 種`);
const started = Date.now();
const result = simulate({ strikes, rtp, bet: 1, seed, monsters, spawnWeights, skills });
const error = result.rtp - rtp;

console.log(`實際 RTP ${(result.rtp * 100).toFixed(4)}%（誤差 ${(error * 100).toFixed(4)}%，標準誤 ${(result.standardError * 100).toFixed(4)}%）`);
console.log(`擊殺 ${result.kills.toLocaleString()} 隻，單刀最高派彩 ${result.maxPayoutMultiple}×，耗時 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
console.log('依命中隻數：');
for (const [n, g] of Object.entries(result.byTargets)) console.log(`  ${n.padStart(2)} 隻：${(g.rtp * 100).toFixed(3)}%（${g.strikes.toLocaleString()} 刀）`);

if (Math.abs(error) > tolerance) {
  console.error(`✗ 誤差超過 ${(tolerance * 100).toFixed(2)}%`);
  process.exit(1);
}
console.log(`✓ 誤差在 ${(tolerance * 100).toFixed(2)}% 以內`);
