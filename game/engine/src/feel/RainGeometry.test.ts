import { describe, expect, it } from 'vitest';
import { firstRainSurface, rainQuad } from './RainGeometry';

describe('rain terrain occlusion', () => {
  const terrain = [
    { x1: 0, y1: 600, x2: 1000, y2: 600 },
    { x1: 100, y1: 220, x2: 350, y2: 220 },
    { x1: 150, y1: 400, x2: 700, y2: 400 },
    { x1: 700, y1: 400, x2: 900, y2: 500 },
  ];
  it('stops at the first layer; gaps reveal middle, slope and ground layers', () => {
    expect(firstRainSurface(terrain, 200, -100)?.y).toBe(220);
    expect(firstRainSurface(terrain, 500, -100)?.y).toBe(400);
    expect(firstRainSurface(terrain, 800, -100)).toEqual({ y: 450, slope: .5 });
    expect(firstRainSurface(terrain, 950, -100)?.y).toBe(600);
    expect(firstRainSurface(terrain, 1100, -100)).toBeNull();
    expect(firstRainSurface(terrain, 200, 300)?.y).toBe(400);
  });
  it('hides half an embedded weapon without compressing its texture', () => {
    const polygon = rainQuad(100, 200, 1, 500, { y: 400, slope: 0 });
    expect(polygon).toHaveLength(4);
    expect(Math.max(...polygon.map(p => p.y + 500))).toBe(400);
    expect(Math.max(...polygon.map(p => p.v))).toBe(.5);
    expect(Math.min(...polygon.map(p => p.y + 500))).toBe(300);
  });
  it('clips every vertex to either slope direction and preserves UV correspondence', () => {
    for (const slope of [-1, .5, 1]) for (const tip of [385, 450, 580]) {
      const polygon = rainQuad(100, 200, .95, tip, { y: 400, slope });
      for (const p of polygon) {
        expect(p.y + tip - 400 - p.x * slope).toBeLessThanOrEqual(.000001);
        expect(p.u).toBeCloseTo((p.x + 50) / 100);
        expect(p.v).toBeCloseTo((p.y + 190) / 200);
      }
    }
  });
  it('does not create a fake floor in a gap and fully hides a submerged frame', () => {
    expect(rainQuad(100, 200, 1, 800, null)).toHaveLength(4);
    expect(rainQuad(100, 200, 1, 800, { y: 400, slope: 0 })).toHaveLength(0);
  });
});
