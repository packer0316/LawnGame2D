import type { Ceiling, Climbable, MapDef, Wall } from '../content/map';

/** 足場的一段直線（x1 < x2）。 */
export interface FootholdSegment {
  fh: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  oneWay: boolean;
}

const EPS = 0.01;

/**
 * 地圖碰撞查詢。座標：左上角原點、y 向下、單位像素。
 * 角色以「腳底中心」為位置。
 */
export class FootholdWorld {
  readonly segments: FootholdSegment[] = [];
  readonly walls: readonly Wall[];
  readonly ceilings: readonly Ceiling[];
  readonly climbables: readonly Climbable[];
  readonly width: number;
  readonly height: number;
  private readonly byFoothold = new Map<number, FootholdSegment[]>();

  constructor(map: Pick<MapDef, 'footholds' | 'walls' | 'ceilings' | 'climbables' | 'size'>) {
    for (const foothold of map.footholds) {
      const list: FootholdSegment[] = [];
      for (let i = 0; i + 1 < foothold.points.length; i += 1) {
        const [x1, y1] = foothold.points[i]!;
        const [x2, y2] = foothold.points[i + 1]!;
        const seg = { fh: foothold.id, x1, y1, x2, y2, oneWay: foothold.oneWay };
        list.push(seg);
        this.segments.push(seg);
      }
      this.byFoothold.set(foothold.id, list);
    }
    this.walls = map.walls;
    this.ceilings = map.ceilings;
    this.climbables = map.climbables;
    this.width = map.size.w;
    this.height = map.size.h;
  }

  /** 足場在 x 的高度；x 不在足場範圍內時回傳 null。 */
  footholdY(fh: number, x: number): number | null {
    const list = this.byFoothold.get(fh);
    if (!list) return null;
    for (const seg of list) {
      if (x >= seg.x1 - EPS && x <= seg.x2 + EPS) return segmentY(seg, x);
    }
    return null;
  }

  /** 足場的左右範圍。 */
  footholdRange(fh: number): { x1: number; x2: number } | null {
    const list = this.byFoothold.get(fh);
    if (!list || list.length === 0) return null;
    return { x1: list[0]!.x1, x2: list.at(-1)!.x2 };
  }

  isOneWay(fh: number): boolean {
    return this.byFoothold.get(fh)?.[0]?.oneWay ?? false;
  }

  /** 從 fromY 往下找第一個足場（含 fromY 本身，容許 tolerance）。 */
  groundBelow(x: number, fromY: number, tolerance = 0, ignore: number | null = null): { fh: number; y: number } | null {
    let best: { fh: number; y: number } | null = null;
    for (const seg of this.segments) {
      if (seg.fh === ignore || x < seg.x1 - EPS || x > seg.x2 + EPS) continue;
      const y = segmentY(seg, x);
      if (y >= fromY - tolerance && (!best || y < best.y)) best = { fh: seg.fh, y };
    }
    return best;
  }

  /**
   * 腳底從 (x0, y0) 移到 (x1, y1) 的途中，第一個「由上往下」穿過的足場，回傳穿過的那一點。
   * 沿整條移動線段檢查，不只看終點的 x：高速水平移動（衝刺、跳斬）撞進上坡時才不會穿地。
   * solidOnly：只看實心足場。上升中用這個，可以從下面跳穿單向平台，但不能橫衝進實心斜坡。
   */
  findLanding(x0: number, y0: number, x1: number, y1: number, ignore: number | null, solidOnly = false): { fh: number; x: number; y: number } | null {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let best: { fh: number; x: number; y: number; t: number } | null = null;
    for (const seg of this.segments) {
      if (seg.fh === ignore || (solidOnly && seg.oneWay)) continue;
      // 把移動線段裁到這段足場的 x 範圍：t ∈ [ta, tb]
      let ta = 0;
      let tb = 1;
      if (Math.abs(dx) < EPS) {
        if (x0 < seg.x1 - EPS || x0 > seg.x2 + EPS) continue;
      } else {
        const tl = (seg.x1 - EPS - x0) / dx;
        const tr = (seg.x2 + EPS - x0) / dx;
        ta = Math.max(0, Math.min(tl, tr));
        tb = Math.min(1, Math.max(tl, tr));
        if (ta > tb) continue;
      }
      // 裁出的區間內，腳底減足場高度是線性的：起點在上面（≤ 0）、終點在下面（≥ 0）就是穿過
      const da = y0 + dy * ta - segmentY(seg, x0 + dx * ta);
      const db = y0 + dy * tb - segmentY(seg, x0 + dx * tb);
      if (da > EPS || db < -EPS) continue;
      const t = da >= -EPS ? ta : ta + ((tb - ta) * da) / (da - db);
      const x = x0 + dx * t;
      const y = segmentY(seg, x);
      if (!best || t < best.t - EPS || (Math.abs(t - best.t) <= EPS && y < best.y)) best = { fh: seg.fh, x, y, t };
    }
    return best && { fh: best.fh, x: best.x, y: best.y };
  }

  /** 水平移動被牆擋住時，回傳修正後的 x。top／bottom 是身體的垂直範圍。 */
  blockByWalls(fromX: number, toX: number, top: number, bottom: number, halfWidth: number): number {
    let x = toX;
    for (const wall of this.walls) {
      if (wall.yBottom <= top + 1 || wall.yTop >= bottom - 1) continue;
      if (wall.side === 1 && toX > fromX) {
        // 實心在右：身體右緣不能超過牆
        const limit = wall.x - halfWidth;
        if (fromX <= limit + EPS && x > limit) x = limit;
      } else if (wall.side === -1 && toX < fromX) {
        const limit = wall.x + halfWidth;
        if (fromX >= limit - EPS && x < limit) x = limit;
      }
    }
    return Math.max(halfWidth, Math.min(this.width - halfWidth, x));
  }

  /** 往上移動時頭撞到的天花板 y；沒撞到回傳 null。 */
  ceilingHit(x: number, halfWidth: number, headFrom: number, headTo: number): number | null {
    let hit: number | null = null;
    for (const ceiling of this.ceilings) {
      if (x + halfWidth <= ceiling.x1 || x - halfWidth >= ceiling.x2) continue;
      if (headFrom >= ceiling.y - EPS && headTo < ceiling.y && (hit === null || ceiling.y > hit)) hit = ceiling.y;
    }
    return hit;
  }

  /** 附近可以抓的繩梯。feetY 在繩梯範圍內（含上方 reachAbove 像素）才算。 */
  climbableAt(x: number, feetY: number, grab: number, reachAbove = 0): Climbable | null {
    let best: Climbable | null = null;
    for (const c of this.climbables) {
      if (Math.abs(x - c.x) > grab) continue;
      if (feetY < c.yTop - reachAbove || feetY > c.yBottom) continue;
      if (!best || Math.abs(x - c.x) < Math.abs(x - best.x)) best = c;
    }
    return best;
  }
}

export function segmentY(seg: FootholdSegment, x: number): number {
  if (seg.x2 === seg.x1) return seg.y1;
  const t = Math.max(0, Math.min(1, (x - seg.x1) / (seg.x2 - seg.x1)));
  return seg.y1 + (seg.y2 - seg.y1) * t;
}
