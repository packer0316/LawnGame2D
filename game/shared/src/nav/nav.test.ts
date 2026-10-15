import { describe, expect, it } from 'vitest';
import { buildNavGraph } from './buildNavGraph';

/**
 *  y=140      ═══════ 單向平台 2（x 40–90），梯子 x=70 通到地面
 *  y=168                       ┌──────── 高台 3（x 132–200），左側是牆
 *  y=200 ──────────────────────┘ 地面 1（x 0–132）
 */
const map = {
  size: { w: 240, h: 260 },
  footholds: [
    { id: 1, points: [[0, 200], [132, 200]] as [number, number][], oneWay: false },
    { id: 2, points: [[40, 140], [90, 140]] as [number, number][], oneWay: true },
    { id: 3, points: [[132, 168], [240, 168]] as [number, number][], oneWay: false },
  ],
  walls: [{ id: 1, x: 132, yTop: 168, yBottom: 200, side: 1 as const }],
  ceilings: [],
  climbables: [{ id: 1, type: 'ladder' as const, x: 70, yTop: 156, yBottom: 200 }],
};

describe('buildNavGraph', () => {
  const nav = buildNavGraph(map);
  const has = (from: number, to: number, type?: string) => nav.edges.some((e) => e.from === from && e.to === to && (!type || e.type === type));

  it('每個足場一個節點', () => {
    expect(nav.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('地面可以跳上單向平台與高台', () => {
    expect(has(1, 2, 'jump')).toBe(true);
    expect(has(1, 3, 'jump')).toBe(true);
  });

  it('單向平台可以下跳或走下去回到地面', () => {
    expect(has(2, 1, 'drop')).toBe(true);
  });

  it('高台可以走下去', () => {
    expect(has(3, 1)).toBe(true);
  });

  it('梯子雙向連接', () => {
    expect(has(1, 2, 'climb')).toBe(true);
    expect(has(2, 1, 'climb')).toBe(true);
  });

  it('懸空的繩子：跳得到就算連通', () => {
    const rope = buildNavGraph({
      ...map,
      // 繩子底端在 y=170，離地面（200）30 像素，跳得到
      climbables: [{ id: 2, type: 'rope' as const, x: 70, yTop: 156, yBottom: 170 }],
    });
    expect(rope.edges.some((e) => e.type === 'climb' && e.from === 1 && e.to === 2)).toBe(true);
  });

  it('邊帶有起跳點', () => {
    const jump = nav.edges.find((e) => e.type === 'jump' && e.from === 1 && e.to === 3)!;
    expect(jump.x).toBeGreaterThan(0);
    expect(jump.dir).toBeDefined();
  });
});
