import type { MapDef } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { buildLdtkProject } from '../../tools/fixtures/src/ldtkBuilder';
import { generateRoom } from '../../tools/fixtures/src/rooms';
import { convertLdtkProject } from '../ldtk/convert';
import { footholdYAt } from './geometry';
import { validateMap, validateMaps } from './validate';

const tilesets = [{ identifier: 'forest', relPath: 'tilesets/forest.png', pxWid: 128, pxHei: 32 }];
const maps = convertLdtkProject(
  buildLdtkProject(Array.from({ length: 20 }, (_, i) => generateRoom(i + 1)), tilesets),
).maps;
const ids = new Set(maps.map((m) => m.id));
const errors = (map: MapDef, all = ids) => validateMap(map, all).filter((i) => i.severity === 'error');

describe('validateMaps', () => {
  it('測試用 20 房沒有錯誤', () => {
    expect(validateMaps(maps).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('缺少上一房傳送點', () => {
    const map = { ...maps[0]!, portals: maps[0]!.portals.filter((p) => p.type !== 'prev') };
    expect(errors(map).map((i) => i.message)).toEqual(['map_0001：沒有「上一房」傳送點']);
  });

  it('出生點懸空', () => {
    const map = structuredClone(maps[0]!);
    map.portals.find((p) => p.type === 'spawn')!.y -= 40;
    expect(errors(map).map((i) => i.message)).toEqual([expect.stringContaining('出生點')]);
  });

  it('指定房傳送點的目標不存在', () => {
    const map = structuredClone(maps[0]!);
    map.portals.push({ id: 'x', type: 'toRoom', x: map.portals[0]!.x, y: map.portals[0]!.y, toRoom: 7 });
    expect(errors(map, new Set(['map_0001']))).toEqual([expect.objectContaining({ message: 'map_0001：傳送點目標房 7 的地圖不存在' })]);
  });

  it('生怪區不在足場上', () => {
    const map = structuredClone(maps[0]!);
    map.spawnZones[0]!.footholdIds = [];
    expect(errors(map)).toHaveLength(1);
  });

  it('導航圖：從出生點走不到的平台是警告（節點 = 足場 ID，與 buildNavGraph 相同）', () => {
    const map = structuredClone(maps[0]!);
    const spawn = map.portals.find((p) => p.type === 'spawn')!;
    const ground = map.footholds.find((f) => footholdYAt(f, spawn.x) === spawn.y)!;
    const other = map.footholds.find((f) => f.id !== ground.id)!;
    const nodes = map.footholds.map((f) => ({ id: f.id, footholdIds: [f.id] }));
    // 只有一條無關的邊（不是空的，避免改用 buildNavGraph）
    map.nav = { nodes, edges: [{ from: other.id, to: ground.id, type: 'drop' }] };
    expect(validateMap(map, ids).filter((i) => i.target === `fh:${other.id}`)).toHaveLength(1);
    map.nav.edges.push({ from: ground.id, to: other.id, type: 'jump' });
    expect(validateMap(map, ids).filter((i) => i.target === `fh:${other.id}`)).toHaveLength(0);
  });

  it('自動掛機走不到「下一房」傳送點是錯誤', () => {
    const map = structuredClone(maps[0]!);
    const spawn = map.portals.find((p) => p.type === 'spawn')!;
    const next = map.portals.find((p) => p.type === 'next')!;
    const spawnFh = map.footholds.find((f) => footholdYAt(f, spawn.x) === spawn.y)!;
    const nextFh = map.footholds.find((f) => footholdYAt(f, next.x) === next.y)!;
    if (spawnFh.id === nextFh.id) {
      // 同一條地面：把下一房傳送點搬到某個平台上
      const plat = map.footholds.find((f) => f.id !== spawnFh.id)!;
      next.x = (plat.points[0]![0] + plat.points[1]![0]) / 2;
      next.y = footholdYAt(plat, next.x)!;
    }
    map.nav = { nodes: [], edges: [{ from: 999, to: 998, type: 'run' }] };
    expect(errors(map).map((i) => i.message)).toEqual([expect.stringContaining('走不到「下一房」傳送點')]);
  });
});
