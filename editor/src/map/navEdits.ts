/**
 * 導航圖的手動增刪（STUDIO_SPEC §6.3）。存在 content/maps/{mapId}.navedits.json（只有編輯器讀寫）。
 * 足場 ID 會因為在 LDtk 改地圖而重新編號，所以手動連線以「足場上的一點」記錄，套用時再找出對應的足場。
 */
import type { MapDef, NavEdgeType, NavGraph } from '@lawn/shared';
import { footholdUnder } from './geometry';

export interface NavEditEdge {
  /** 起點（在 from 足場上，x 也是起跳點）。 */
  from: [number, number];
  /** 終點（在 to 足場上）。 */
  to: [number, number];
  type: NavEdgeType;
  dir?: -1 | 0 | 1;
}

export interface NavEdits {
  schemaVersion: 1;
  add: NavEditEdge[];
  remove: NavEditEdge[];
}

export const navEditsPath = (mapId: string) => `maps/${mapId}.navedits.json`;

export const emptyNavEdits = (): NavEdits => ({ schemaVersion: 1, add: [], remove: [] });

type NavEdge = NavGraph['edges'][number];

const TOLERANCE = 6;

function resolve(map: MapDef, e: NavEditEdge): { from: number; to: number } | null {
  const from = footholdUnder(map, e.from[0], e.from[1], TOLERANCE);
  const to = footholdUnder(map, e.to[0], e.to[1], TOLERANCE);
  return from && to && from.id !== to.id ? { from: from.id, to: to.id } : null;
}

export interface AppliedNav {
  nav: NavGraph;
  /** 找不到對應足場的手動修改（地圖改過之後）。 */
  unresolved: { kind: 'add' | 'remove'; edge: NavEditEdge }[];
  /** 手動加入的邊（from>to>type）。 */
  manual: Set<string>;
}

export const edgeKey = (e: { from: number; to: number; type: string }) => `${e.from}>${e.to}>${e.type}`;

export function applyNavEdits(map: MapDef, nav: NavGraph, edits: NavEdits | undefined): AppliedNav {
  const unresolved: AppliedNav['unresolved'] = [];
  const manual = new Set<string>();
  if (!edits) return { nav, unresolved, manual };
  const edges = new Map<string, NavEdge>(nav.edges.map((e) => [edgeKey(e), e]));
  for (const r of edits.remove) {
    const ids = resolve(map, r);
    if (!ids) unresolved.push({ kind: 'remove', edge: r });
    else edges.delete(edgeKey({ ...ids, type: r.type }));
  }
  for (const a of edits.add) {
    const ids = resolve(map, a);
    if (!ids) {
      unresolved.push({ kind: 'add', edge: a });
      continue;
    }
    const edge: NavEdge = { ...ids, type: a.type, x: Math.round(a.from[0]), dir: a.dir ?? (Math.sign(a.to[0] - a.from[0]) as -1 | 0 | 1) };
    edges.set(edgeKey(edge), edge);
    manual.add(edgeKey(edge));
  }
  // 每個足場一個節點（與 buildNavGraph 相同）
  const nodeIds = new Set(nav.nodes.map((n) => n.id));
  const nodes = [...nav.nodes];
  for (const e of edges.values()) {
    for (const id of [e.from, e.to]) {
      if (!nodeIds.has(id)) {
        nodeIds.add(id);
        nodes.push({ id, footholdIds: [id] });
      }
    }
  }
  return { nav: { nodes, edges: [...edges.values()] }, unresolved, manual };
}

/** 把畫面上選到的邊（足場 ID）轉成以座標記錄的手動修改。 */
export function toEditEdge(map: MapDef, edge: NavEdge): NavEditEdge | null {
  const from = map.footholds.find((f) => f.id === edge.from);
  const to = map.footholds.find((f) => f.id === edge.to);
  if (!from || !to) return null;
  const pointOn = (pts: [number, number][], x?: number): [number, number] => {
    if (x !== undefined) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i]!;
        const [x2, y2] = pts[i + 1]!;
        if (x >= x1 && x <= x2) return [x, Math.round(y1 + ((y2 - y1) * (x - x1)) / (x2 - x1 || 1))];
      }
    }
    const a = pts[Math.floor((pts.length - 1) / 2)]!;
    const b = pts[Math.floor((pts.length - 1) / 2) + 1] ?? a;
    return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  };
  return { from: pointOn(from.points, edge.x), to: pointOn(to.points), type: edge.type, ...(edge.dir !== undefined ? { dir: edge.dir } : {}) };
}

const sameEdit = (a: NavEditEdge, b: NavEditEdge) =>
  a.type === b.type && a.from[0] === b.from[0] && a.from[1] === b.from[1] && a.to[0] === b.to[0] && a.to[1] === b.to[1];

/** 刪除一條邊：手動加的就從 add 拿掉，自動產生的就記到 remove。 */
export function removeEdge(map: MapDef, edits: NavEdits, edge: NavEdge): NavEdits {
  const manualIndex = edits.add.findIndex((a) => {
    const ids = resolve(map, a);
    return ids !== null && edgeKey({ ...ids, type: a.type }) === edgeKey(edge);
  });
  if (manualIndex >= 0) return { ...edits, add: edits.add.filter((_, i) => i !== manualIndex) };
  const e = toEditEdge(map, edge);
  return e && !edits.remove.some((r) => sameEdit(r, e)) ? { ...edits, remove: [...edits.remove, e] } : edits;
}
