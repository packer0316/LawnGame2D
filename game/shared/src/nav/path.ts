import type { NavEdgeType, NavGraph } from '../content/map';

type Edge = NavGraph['edges'][number];

/** 各種移動方式的成本（大約等於耗時），找路時取總成本最低的路線。 */
export const NAV_EDGE_COST: Record<NavEdgeType, number> = {
  run: 1,
  drop: 1.2,
  jump: 1.6,
  roll: 1,
  climb: 2.5,
  portal: 3,
};

/** 從 start 足場出發，沿導航圖走得到的所有足場（含 start）。 */
export function reachableFrom(nav: NavGraph, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const edge of nav.edges) {
      if (edge.from === node && !seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return seen;
}

/** 從 from 到每個走得到的足場的最低成本（Dijkstra）；走不到的不在結果中。 */
export function navDistances(nav: NavGraph, from: number): Map<number, number> {
  const dist = new Map<number, number>([[from, 0]]);
  const open = new Set<number>([from]);
  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const node of open) {
      const d = dist.get(node)!;
      if (d < best) {
        best = d;
        current = node;
      }
    }
    open.delete(current);
    for (const edge of nav.edges) {
      if (edge.from !== current) continue;
      const next = best + NAV_EDGE_COST[edge.type];
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        open.add(edge.to);
      }
    }
  }
  return dist;
}

/**
 * from → to 的最低成本路線（Dijkstra）。回傳要依序執行的邊；
 * from === to 時回傳空陣列，走不到時回傳 null。
 */
export function findPath(nav: NavGraph, from: number, to: number): Edge[] | null {
  if (from === to) return [];
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, Edge>();
  const open = new Set<number>([from]);
  const done = new Set<number>();
  while (open.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const node of open) {
      const d = dist.get(node)!;
      if (d < best) {
        best = d;
        current = node;
      }
    }
    open.delete(current);
    if (current === to) break;
    done.add(current);
    for (const edge of nav.edges) {
      if (edge.from !== current || done.has(edge.to)) continue;
      const next = best + NAV_EDGE_COST[edge.type];
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, edge);
        open.add(edge.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: Edge[] = [];
  for (let node = to; node !== from; ) {
    const edge = prev.get(node)!;
    path.unshift(edge);
    node = edge.from;
  }
  return path;
}
