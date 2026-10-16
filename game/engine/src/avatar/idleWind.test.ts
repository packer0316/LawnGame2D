import { describe, expect, it } from 'vitest';
import { idleWind } from './idleWind';

describe('idle wind attachment constraints', () => {
  for (const outfit of [null, 'ninja-1', 'hood-1']) {
    it(`${outfit ?? 'original'} pins face, grip, belt and soles throughout the cycle`, () => {
      for (let ms = 0; ms < 8000; ms += 83) {
        for (const [x, y] of [[58, 79], [48, 97], [64, 106], [59, 120], [72, 120]]) {
          const offset = idleWind(x!, y!, ms, outfit);
          expect(Math.hypot(offset.x, offset.y)).toBe(0);
        }
      }
    });
  }
  it('moves hair and cape with different phases and bounded subtle displacement', () => {
    const hair = [], cape = [];
    for (let ms = 0; ms < 6000; ms += 40) {
      const h = idleWind(64, 60, ms, null), c = idleWind(86, 105, ms, null);
      hair.push(h.x); cape.push(c.x);
      expect(Math.abs(h.x)).toBeLessThanOrEqual(1.05);
      expect(Math.abs(c.x)).toBeLessThanOrEqual(2.35);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(.65);
    }
    expect(Math.max(...hair) - Math.min(...hair)).toBeGreaterThan(1.4);
    expect(Math.max(...cape) - Math.min(...cape)).toBeGreaterThan(3);
    expect(hair).not.toEqual(cape);
    const first = idleWind(86, 105, 0, null);
    expect(Math.hypot(first.x, first.y)).toBe(0);
  });
});
