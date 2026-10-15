import type { Foothold, MapDef } from '@lawn/shared';

/** 足場在 x 處的高度；x 不在範圍內時回傳 undefined。 */
export function footholdYAt(fh: Foothold, x: number): number | undefined {
  for (let i = 0; i < fh.points.length - 1; i++) {
    const [x1, y1] = fh.points[i]!;
    const [x2, y2] = fh.points[i + 1]!;
    if (x >= x1 && x <= x2) return x2 === x1 ? y1 : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return undefined;
}

/** (x, y) 正下方 tolerance 像素內的足場；找不到時回傳 undefined。 */
export function footholdUnder(map: MapDef, x: number, y: number, tolerance = 2): Foothold | undefined {
  let best: { fh: Foothold; d: number } | undefined;
  for (const fh of map.footholds) {
    const fy = footholdYAt(fh, x);
    if (fy === undefined) continue;
    const d = Math.abs(fy - y);
    if (d <= tolerance && (!best || d < best.d)) best = { fh, d };
  }
  return best?.fh;
}
