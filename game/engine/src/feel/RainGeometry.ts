/** Presentation collision only. Combat remains owned by the skill strike schedule. */
export interface RainSegment { x1: number; y1: number; x2: number; y2: number }
export interface RainSurface { y: number; slope: number }

export function firstRainSurface(segments: readonly RainSegment[], x: number, fromY: number): RainSurface | null {
  let first: RainSurface | null = null;
  for (const s of segments) {
    if (x < s.x1 || x > s.x2 || s.x2 <= s.x1) continue;
    const slope = (s.y2 - s.y1) / (s.x2 - s.x1);
    const y = s.y1 + (x - s.x1) * slope;
    if (y >= fromY && (!first || y < first.y)) first = { y, slope };
  }
  return first;
}

export interface RainVertex { x: number; y: number; u: number; v: number }

/** Clip geometry AND its UVs: the submerged blade disappears instead of shrinking.
 * Coordinates are local to the tip/contact point; surface.y is world-space at x.
 * Continuing the contacted surface plane also hides blades inside thin platforms.
 */
export function rainQuad(width: number, height: number, originY: number, tipY: number, surface: RainSurface | null): RainVertex[] {
  const top = -height * originY, bottom = top + height;
  const quad = [
    { x: -width / 2, y: top, u: 0, v: 0 }, { x: width / 2, y: top, u: 1, v: 0 },
    { x: width / 2, y: bottom, u: 1, v: 1 }, { x: -width / 2, y: bottom, u: 0, v: 1 },
  ];
  if (!surface) return quad;
  const out: RainVertex[] = [];
  const distance = (p: RainVertex) => p.y + tipY - surface.y - p.x * surface.slope;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!, b = quad[(i + 1) % quad.length]!;
    const da = distance(a), db = distance(b);
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
    }
  }
  return out;
}
