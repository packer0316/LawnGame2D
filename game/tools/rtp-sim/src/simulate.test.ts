import { describe, expect, it } from 'vitest';
import type { SkillDef } from '@lawn/shared';
import { simulate } from './simulate';

const strike = (maxTargets: number, weightRule: 'even' | 'primary50' = 'even') => ({
  atMs: 0,
  area: { shape: 'circle' as const, r: 100 },
  maxTargets,
  pierce: true,
  weightRule,
});

const skills: SkillDef[] = [
  { id: 'skill_0001', name: '單體', classId: 'warrior', kind: 'basic', pose: 'swing1', strikes: [strike(1)], cooldownSec: 0, cancelFromMs: 0, hitStopMs: 0, shake: 0 },
  // 價格 2、兩刀：打中就是一刀 1 倍，總花費跟刀數一樣，方便驗證
  { id: 'skill_0002', name: '群攻', classId: 'warrior', kind: 'active', pose: 'swing1', price: 2, strikes: [strike(12), strike(6, 'primary50')], cooldownSec: 0, cancelFromMs: 0, hitStopMs: 0, shake: 0 },
];

const ultimate: SkillDef = {
  id: 'skill_0040', name: '大絕招', classId: 'warrior', kind: 'active', pose: 'swing1', ultimate: true, price: 20, fullTargets: 10,
  strikes: [strike(25), strike(25), strike(25), strike(25)], cooldownSec: 0, cancelFromMs: 0, hitStopMs: 0, shake: 0,
};

const monsters = [
  { id: 'mob_0001', tier: 'normal' as const, multiplier: 2 },
  { id: 'mob_0002', tier: 'normal' as const, multiplier: [3, 5] as [number, number] },
  { id: 'mob_0004', tier: 'elite' as const, multiplier: [30, 60] as [number, number] },
];
const spawnWeights = { mob_0001: 10, mob_0002: 6, mob_0004: 1 };

describe('rtp-sim', () => {
  it('混合倍率、混合目標數，返還率收斂到設定值', () => {
    const result = simulate({
      strikes: 300_000,
      rtp: 0.96,
      bet: 1,
      seed: 7,
      skills,
      monsters: [
        { id: 'mob_0001', tier: 'normal', multiplier: 2 },
        { id: 'mob_0002', tier: 'normal', multiplier: [3, 5] },
        { id: 'mob_0004', tier: 'elite', multiplier: [30, 60] },
      ],
      spawnWeights: { mob_0001: 10, mob_0002: 6, mob_0004: 1 },
    });
    expect(Math.abs(result.rtp - 0.96)).toBeLessThan(5 * result.standardError + 0.002);
    expect(result.spent).toBe(300_000);
    expect(Object.keys(result.byTargets).length).toBeGreaterThan(5);
  });

  it('技能押注倍數：含 20 倍大絕招，返還率仍是設定值，而且一刀殺得比較多', () => {
    const base = simulate({ strikes: 200_000, rtp: 0.96, bet: 1, seed: 3, skills: [skills[0]!], monsters, spawnWeights });
    const ult = simulate({ strikes: 200_000, rtp: 0.96, bet: 1, seed: 3, skills: [ultimate], monsters, spawnWeights });
    expect(Math.abs(ult.rtp - 0.96)).toBeLessThan(5 * ult.standardError + 0.002);
    expect(ult.spent).toBeGreaterThan(base.spent * 3);
    expect(ult.kills / 200_000).toBeGreaterThan((base.kills / 200_000) * 3);
  });
});
