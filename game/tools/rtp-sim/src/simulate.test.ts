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
  { id: 'skill_0002', name: '群攻', classId: 'warrior', kind: 'active', pose: 'swing1', strikes: [strike(12), strike(6, 'primary50')], cooldownSec: 0, cancelFromMs: 0, hitStopMs: 0, shake: 0 },
];

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
});
