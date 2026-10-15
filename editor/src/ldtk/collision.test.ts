import { describe, expect, it } from 'vitest';
import { buildCollisionShapes } from './collision';

/** . 空、# 實地、= 單向平台、/ 上坡、\ 下坡、| 繩索、H 梯子、X 不認得的值 */
const CHARS: Record<string, number> = { '.': 0, '#': 1, '=': 2, '/': 3, '\\': 4, '|': 5, H: 6, X: 9 };

function grid(rows: string[], gridSize = 16) {
  const cHei = rows.length;
  const cWid = rows[0]!.length;
  const cells = rows.flatMap((row) => [...row].map((ch) => CHARS[ch]!));
  return buildCollisionShapes({ cWid, cHei, gridSize, cells });
}

describe('buildCollisionShapes', () => {
  it('平地合成一條地面，地圖邊界不產生牆', () => {
    const s = grid(['....', '....', '####']);
    expect(s.footholds).toEqual([{ id: 1, points: [[0, 32], [64, 32]], oneWay: false }]);
    expect(s.walls).toEqual([]);
    expect(s.ceilings).toEqual([]);
  });

  it('上坡接同高的平台：同一條折線，沒有牆', () => {
    const s = grid([
      '....',
      './##',
      '####',
    ]);
    expect(s.footholds).toEqual([{ id: 1, points: [[0, 32], [16, 32], [32, 16], [64, 16]], oneWay: false }]);
    expect(s.walls).toEqual([]);
    expect(s.ceilings).toEqual([]);
  });

  it('山丘：上坡、坡頂、下坡合成一條折線，共線點會被去掉', () => {
    const s = grid([
      '......',
      '../\\..',
      './##\\.',
      '######',
    ]);
    expect(s.footholds).toEqual([
      { id: 1, points: [[0, 48], [16, 48], [48, 16], [80, 48], [96, 48]], oneWay: false },
    ]);
    expect(s.walls).toEqual([]);
  });

  it('階梯：地面在落差處斷開，並產生牆', () => {
    const s = grid([
      '....',
      '..##',
      '####',
    ]);
    expect(s.footholds.map((f) => f.points)).toEqual([
      [[32, 16], [64, 16]],
      [[0, 32], [32, 32]],
    ]);
    expect(s.walls).toEqual([{ id: 1, x: 32, yTop: 16, yBottom: 32, side: 1 }]);
  });

  it('懸空平台：上面是地面、下面是天花板、兩側是牆', () => {
    const s = grid([
      '.....',
      '.###.',
      '.....',
    ]);
    expect(s.footholds).toEqual([{ id: 1, points: [[16, 16], [64, 16]], oneWay: false }]);
    expect(s.ceilings).toEqual([{ id: 1, y: 32, x1: 16, x2: 64 }]);
    expect(s.walls).toEqual([
      { id: 1, x: 16, yTop: 16, yBottom: 32, side: 1 },
      { id: 2, x: 64, yTop: 16, yBottom: 32, side: -1 },
    ]);
  });

  it('連續的牆會合併', () => {
    const s = grid([
      '..#',
      '..#',
      '..#',
      '###',
    ]);
    expect(s.walls).toEqual([{ id: 1, x: 32, yTop: 0, yBottom: 48, side: 1 }]);
  });

  it('單向平台只有地面，沒有牆與天花板', () => {
    const s = grid(['....', '.==.', '....']);
    expect(s.footholds).toEqual([{ id: 1, points: [[16, 16], [48, 16]], oneWay: true }]);
    expect(s.walls).toEqual([]);
    expect(s.ceilings).toEqual([]);
  });

  it('單向平台接實地：oneWay 不同就分開，平台下方的實地仍有地面', () => {
    const s = grid(['....', '==##', '####']);
    expect(s.footholds.map((f) => [f.points, f.oneWay])).toEqual([
      [[[0, 16], [32, 16]], true],
      [[[32, 16], [64, 16]], false],
      [[[0, 32], [32, 32]], false],
    ]);
  });

  it('上坡右側接空氣會產生牆，低側不會', () => {
    const s = grid(['...', './.', '###']);
    expect(s.walls).toEqual([{ id: 1, x: 32, yTop: 16, yBottom: 32, side: -1 }]);
  });

  it('實地下方是斜坡時有天花板', () => {
    const s = grid(['.#.', './.', '###']);
    expect(s.ceilings).toEqual([{ id: 1, y: 16, x1: 16, x2: 32 }]);
  });

  it('繩索與梯子：同一欄連續的格子合併', () => {
    const s = grid([
      '.|H.',
      '.|H.',
      '..H.',
      '####',
    ]);
    expect(s.climbables).toEqual([
      { id: 1, type: 'rope', x: 24, yTop: 0, yBottom: 32 },
      { id: 2, type: 'ladder', x: 40, yTop: 0, yBottom: 48 },
    ]);
  });

  it('不認得的值會回報', () => {
    const s = grid(['.X', '##']);
    expect(s.unknownCells).toEqual([[1, 0, 9]]);
  });
});
