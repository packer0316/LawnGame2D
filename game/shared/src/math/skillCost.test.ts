import { describe, expect, it } from 'vitest';
import type { SkillDef } from '../content/class';
import { resolveStrike, seededRandom, strikeWeights, killProbability } from './rtp';
import { MAX_SKILL_PRICE, strikeCostMultiplier } from './skillCost';

const strike = (maxTargets: number) => ({ atMs: 100, area: { shape: 'circle' as const, r: 100 }, maxTargets, pierce: true, weightRule: 'even' as const });
const skill = (price: number, fullTargets: number, strikes: number, maxTargets = 30) =>
  ({ price, fullTargets, strikes: Array.from({ length: strikes }, () => strike(maxTargets)) }) as Pick<SkillDef, 'price' | 'fullTargets' | 'strikes'>;
const targets = (multipliers: number[]) => multipliers.map((multiplier, uid) => ({ uid, multiplier }));
const RTP = 0.96;

describe('技能押注倍數', () => {
  it('打滿：一刀扣 價格 ÷ 刀數；放完全部刀數剛好是價格', () => {
    const s = skill(20, 25, 4);
    const c = strikeCostMultiplier(s, 0, targets(Array.from({ length: 25 }, () => 5)), RTP);
    expect(c).toBe(5);
    expect(c * 4).toBe(MAX_SKILL_PRICE);
  });

  it('打得少按比例少扣、打得比滿價多也不多收、揮空不扣', () => {
    const s = skill(20, 25, 4);
    expect(strikeCostMultiplier(s, 0, targets(Array.from({ length: 10 }, () => 5)), RTP)).toBe(2);
    expect(strikeCostMultiplier(s, 0, targets(Array.from({ length: 40 }, () => 5)), RTP)).toBe(5);
    expect(strikeCostMultiplier(s, 0, [], RTP)).toBe(0);
  });

  it('壓到每隻擊殺機率 ≤ 1：大技能只打到一隻小怪時不會收太多', () => {
    const s = skill(20, 1, 1);
    const c = strikeCostMultiplier(s, 0, targets([2]), RTP);
    expect(c).toBeLessThanOrEqual(2 / RTP);
    expect(killProbability(RTP, 1, 2, c)).toBeLessThanOrEqual(1);
  });

  it('開發模式（flat）：每一刀固定 1 倍', () => {
    expect(strikeCostMultiplier(skill(20, 25, 4), 0, targets([5, 5, 5]), RTP, { flat: true })).toBe(1);
  });

  it('期望值永遠是 RTP × 實際花費（任何價格、任何隻數）', () => {
    for (const [price, full, n] of [[1, 1, 1], [6, 4, 3], [20, 25, 7], [20, 25, 30], [9, 5, 1]] as const) {
      const s = skill(price, full, 3);
      const ts = targets(Array.from({ length: n }, (_, i) => 2 + (i % 7) * 3));
      const c = strikeCostMultiplier(s, 0, ts, RTP);
      const w = strikeWeights(ts.length, 'even');
      const ev = ts.reduce((sum, t, i) => sum + killProbability(RTP, w[i]!, t.multiplier, c) * t.multiplier, 0);
      expect(ev).toBeCloseTo(RTP * c, 10);
    }
  });

  it('蒙地卡羅：大絕招打滿時返還率約 96%，而且一刀殺得比普攻多', () => {
    const random = seededRandom(7);
    const s = skill(20, 25, 4);
    const ts = targets(Array.from({ length: 25 }, (_, i) => 2 + (i % 5)));
    let spent = 0;
    let paid = 0;
    let kills = 0;
    const casts = 40_000;
    for (let i = 0; i < casts; i += 1) {
      const c = strikeCostMultiplier(s, 0, ts, RTP);
      const out = resolveStrike(ts, 1, RTP, 'even', random, c);
      spent += c;
      paid += out.reduce((sum, o) => sum + o.payout, 0);
      kills += out.filter((o) => o.killed).length;
    }
    expect(paid / spent).toBeGreaterThan(0.94);
    expect(paid / spent).toBeLessThan(0.98);
    expect(kills / casts).toBeGreaterThan(1); // 普攻一刀平均不到 0.5 隻
  });
});
