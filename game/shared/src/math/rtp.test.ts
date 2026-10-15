import { describe, expect, it } from 'vitest';
import { killProbability, resolveStrike, seededRandom, strikeWeights } from './rtp';

describe('一刀一注', () => {
  it('權重加總為 1', () => {
    for (const n of [1, 2, 5, 15]) {
      for (const rule of ['even', 'primary50'] as const) {
        const sum = strikeWeights(n, rule).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 10);
      }
    }
    expect(strikeWeights(4, 'primary50')[0]).toBe(0.5);
  });

  it('機率不超過 0.5', () => {
    expect(killProbability(0.96, 1, 2)).toBeCloseTo(0.48, 10);
    expect(killProbability(0.96, 1, 1)).toBeCloseTo(0.48, 10); // 倍率低於 2 視為 2
  });

  it('蒙地卡羅：不管打幾隻、什麼倍率，返還率都收斂到 RTP', () => {
    const random = seededRandom(42);
    const rtp = 0.96;
    const scenarios = [
      { targets: [2], rule: 'even' as const },
      { targets: [300], rule: 'even' as const },
      { targets: [2, 5, 10, 30, 2, 2, 3, 8], rule: 'even' as const },
      { targets: [100, 2, 2, 2], rule: 'primary50' as const },
    ];
    for (const { targets, rule } of scenarios) {
      let spent = 0;
      let paid = 0;
      for (let i = 0; i < 400_000; i += 1) {
        spent += 1;
        const outcome = resolveStrike(
          targets.map((multiplier, uid) => ({ uid, multiplier })),
          1,
          rtp,
          rule,
          random,
        );
        paid += outcome.reduce((sum, o) => sum + o.payout, 0);
      }
      // 高倍率單體變異大，容許誤差放寬
      const tolerance = targets.length === 1 && targets[0]! >= 100 ? 0.08 : 0.02;
      expect(Math.abs(paid / spent - rtp), `${targets.join(',')}`).toBeLessThan(tolerance);
    }
  });
});
