import { buildNavGraph } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { buildLdtkProject } from '../../tools/fixtures/src/ldtkBuilder';
import { generateRoom } from '../../tools/fixtures/src/rooms';
import { convertLdtkProject } from '../ldtk/convert';
import { applyNavEdits, edgeKey, emptyNavEdits, removeEdge, toEditEdge } from './navEdits';

const [map] = convertLdtkProject(
  buildLdtkProject([generateRoom(5)], [{ identifier: 'forest', relPath: 'tilesets/forest.png', pxWid: 128, pxHei: 32 }]),
  { buildNav: buildNavGraph },
).maps;

describe('導航圖手動修改', () => {
  it('buildNavGraph 有產生節點與邊', () => {
    expect(map!.nav.nodes.length).toBe(map!.footholds.length);
    expect(map!.nav.edges.length).toBeGreaterThan(0);
  });

  it('刪除自動產生的邊：記成座標，套用後消失；再套用到重新編號的地圖也正確', () => {
    const edge = map!.nav.edges[0]!;
    const edits = removeEdge(map!, emptyNavEdits(), edge);
    expect(edits.remove).toHaveLength(1);
    const applied = applyNavEdits(map!, map!.nav, edits);
    expect(applied.nav.edges.some((e) => edgeKey(e) === edgeKey(edge))).toBe(false);
    expect(applied.unresolved).toEqual([]);

    // 足場重新編號（例如 LDtk 改過地圖）：座標仍對得到
    const shift = 100;
    const renumbered = {
      ...map!,
      footholds: map!.footholds.map((f) => ({ ...f, id: f.id + shift })),
    };
    const nav = { nodes: map!.nav.nodes.map((n) => ({ id: n.id + shift, footholdIds: n.footholdIds.map((x) => x + shift) })), edges: map!.nav.edges.map((e) => ({ ...e, from: e.from + shift, to: e.to + shift })) };
    const again = applyNavEdits(renumbered, nav, edits);
    expect(again.nav.edges.some((e) => e.from === edge.from + shift && e.to === edge.to + shift && e.type === edge.type)).toBe(false);
  });

  it('新增手動連線：帶 x 與 dir，再刪除就從 add 拿掉', () => {
    const [a, b] = map!.footholds;
    const add = toEditEdge(map!, { from: a!.id, to: b!.id, type: 'jump' })!;
    let edits = { ...emptyNavEdits(), add: [add] };
    const applied = applyNavEdits(map!, { nodes: [], edges: [] }, edits);
    const edge = applied.nav.edges[0]!;
    expect(edge).toMatchObject({ from: a!.id, to: b!.id, type: 'jump' });
    expect(edge.x).toBe(add.from[0]);
    expect(applied.manual.has(edgeKey(edge))).toBe(true);
    expect(applied.nav.nodes.map((n) => n.id).sort()).toEqual([a!.id, b!.id].sort());
    edits = removeEdge(map!, edits, edge);
    expect(edits).toEqual(emptyNavEdits());
  });

  it('找不到足場的修改會回報', () => {
    const edits = { ...emptyNavEdits(), add: [{ from: [-500, -500] as [number, number], to: [1, 1] as [number, number], type: 'jump' as const }] };
    expect(applyNavEdits(map!, map!.nav, edits).unresolved).toHaveLength(1);
  });
});
