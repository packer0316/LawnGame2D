import type { Ceiling, Climbable, Foothold, Wall } from '@lawn/shared';

/** LDtk `Collision` 圖層的值（STUDIO_SPEC §6.1）。 */
export const Cell = {
  Empty: 0,
  Solid: 1,
  OneWay: 2,
  /** 上坡：左低右高。 */
  SlopeUp: 3,
  /** 下坡：左高右低。 */
  SlopeDown: 4,
  Rope: 5,
  Ladder: 6,
} as const;

export interface CollisionGrid {
  cWid: number;
  cHei: number;
  gridSize: number;
  /** 列優先。 */
  cells: ArrayLike<number>;
}

export interface CollisionShapes {
  footholds: Foothold[];
  walls: Wall[];
  ceilings: Ceiling[];
  climbables: Climbable[];
  /** 不認得的格子值，以 [cx, cy, 值] 回報。 */
  unknownCells: [number, number, number][];
}

// 每種格子哪些邊是「整條實心」（STUDIO_SPEC §6.4）
const solidTop = (v: number) => v === Cell.Solid;
const solidBottom = (v: number) => v === Cell.Solid || v === Cell.SlopeUp || v === Cell.SlopeDown;
const solidLeft = (v: number) => v === Cell.Solid || v === Cell.SlopeDown;
const solidRight = (v: number) => v === Cell.Solid || v === Cell.SlopeUp;

/** 地圖外視為實地，所以邊界上不會產生地面、牆或天花板。 */
const OUTSIDE = Cell.Solid;

type Point = [number, number];

interface Segment {
  a: Point;
  b: Point;
  oneWay: boolean;
}

export function buildCollisionShapes(grid: CollisionGrid): CollisionShapes {
  const { cWid, cHei, gridSize: g } = grid;
  const at = (cx: number, cy: number): number =>
    cx < 0 || cy < 0 || cx >= cWid || cy >= cHei ? OUTSIDE : (grid.cells[cy * cWid + cx] ?? Cell.Empty);

  const segments: Segment[] = [];
  const wallParts: Wall[] = [];
  const ceilingParts: Ceiling[] = [];
  const unknownCells: [number, number, number][] = [];

  for (let cy = 0; cy < cHei; cy++) {
    for (let cx = 0; cx < cWid; cx++) {
      const v = at(cx, cy);
      const x0 = cx * g;
      const y0 = cy * g;
      if (v > Cell.Ladder || v < 0) unknownCells.push([cx, cy, v]);

      // 地面
      const coveredAbove = solidBottom(at(cx, cy - 1));
      if ((v === Cell.Solid || v === Cell.OneWay) && !coveredAbove) {
        segments.push({ a: [x0, y0], b: [x0 + g, y0], oneWay: v === Cell.OneWay });
      } else if (v === Cell.SlopeUp) {
        segments.push({ a: [x0, y0 + g], b: [x0 + g, y0], oneWay: false });
      } else if (v === Cell.SlopeDown) {
        segments.push({ a: [x0, y0], b: [x0 + g, y0 + g], oneWay: false });
      }

      // 牆
      if (solidRight(v) && !solidLeft(at(cx + 1, cy))) {
        wallParts.push({ id: 0, x: x0 + g, yTop: y0, yBottom: y0 + g, side: -1 });
      }
      if (solidLeft(v) && !solidRight(at(cx - 1, cy))) {
        wallParts.push({ id: 0, x: x0, yTop: y0, yBottom: y0 + g, side: 1 });
      }

      // 天花板
      if (solidBottom(v) && !solidTop(at(cx, cy + 1))) {
        ceilingParts.push({ id: 0, y: y0 + g, x1: x0, x2: x0 + g });
      }
    }
  }

  return {
    footholds: chainSegments(segments).map((f, i) => ({ id: i + 1, ...f })),
    walls: mergeWalls(wallParts),
    ceilings: mergeCeilings(ceilingParts),
    climbables: buildClimbables(grid, at),
    unknownCells,
  };
}

const key = (p: Point) => `${p[0]},${p[1]}`;

/** 把首尾相接（且 oneWay 相同）的線段串成折線，再去掉共線的中間點。 */
function chainSegments(segments: Segment[]): { points: Point[]; oneWay: boolean }[] {
  const byStart = new Map<string, Segment[]>();
  const hasPredecessor = new Set<Segment>();
  for (const s of segments) {
    const k = `${key(s.a)}|${s.oneWay}`;
    const list = byStart.get(k);
    if (list) list.push(s);
    else byStart.set(k, [s]);
  }
  for (const s of segments) {
    const next = byStart.get(`${key(s.b)}|${s.oneWay}`)?.[0];
    if (next) hasPredecessor.add(next);
  }

  const used = new Set<Segment>();
  const result: { points: Point[]; oneWay: boolean }[] = [];
  const walk = (start: Segment) => {
    const points: Point[] = [start.a, start.b];
    used.add(start);
    let current = start;
    for (;;) {
      const next = byStart.get(`${key(current.b)}|${current.oneWay}`)?.find((s) => !used.has(s));
      if (!next) break;
      used.add(next);
      points.push(next.b);
      current = next;
    }
    result.push({ points: simplify(points), oneWay: start.oneWay });
  };

  // 先從沒有前一段的線段開始走，剩下的（理論上不會有，地面不會成環）再補走
  for (const s of segments) if (!hasPredecessor.has(s) && !used.has(s)) walk(s);
  for (const s of segments) if (!used.has(s)) walk(s);
  return result;
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    if (cross !== 0) out.push(cur);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function mergeWalls(parts: Wall[]): Wall[] {
  const sorted = [...parts].sort((p, q) => p.side - q.side || p.x - q.x || p.yTop - q.yTop);
  const merged: Wall[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.x === w.x && last.side === w.side && last.yBottom === w.yTop) last.yBottom = w.yBottom;
    else merged.push({ ...w });
  }
  return merged
    .sort((p, q) => p.x - q.x || p.yTop - q.yTop || p.side - q.side)
    .map((w, i) => ({ ...w, id: i + 1 }));
}

function mergeCeilings(parts: Ceiling[]): Ceiling[] {
  const sorted = [...parts].sort((p, q) => p.y - q.y || p.x1 - q.x1);
  const merged: Ceiling[] = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.y === c.y && last.x2 === c.x1) last.x2 = c.x2;
    else merged.push({ ...c });
  }
  return merged.map((c, i) => ({ ...c, id: i + 1 }));
}

function buildClimbables(grid: CollisionGrid, at: (cx: number, cy: number) => number): Climbable[] {
  const { cWid, cHei, gridSize: g } = grid;
  const result: Climbable[] = [];
  for (let cx = 0; cx < cWid; cx++) {
    let cy = 0;
    while (cy < cHei) {
      const v = at(cx, cy);
      if (v !== Cell.Rope && v !== Cell.Ladder) {
        cy++;
        continue;
      }
      const top = cy;
      while (cy < cHei && at(cx, cy) === v) cy++;
      result.push({
        id: 0,
        type: v === Cell.Rope ? 'rope' : 'ladder',
        x: cx * g + g / 2,
        yTop: top * g,
        yBottom: cy * g,
      });
    }
  }
  return result
    .sort((p, q) => p.x - q.x || p.yTop - q.yTop)
    .map((c, i) => ({ ...c, id: i + 1 }));
}
