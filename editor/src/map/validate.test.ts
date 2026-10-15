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

  it('導航圖：從出生點走不到的平台是警告', () => {
    const map = structuredClone(maps[0]!);
    const spawn = map.portals.find((p) => p.type === 'spawn')!;
    const ground = map.footholds.find((f) => footholdYAt(f, spawn.x) === spawn.y)!;
    const other = map.footholds.find((f) => f.id !== ground.id)!;
    map.nav = { nodes: [{ id: 1, footholdIds: [ground.id] }, { id: 2, footholdIds: [other.id] }], edges: [] };
    expect(validateMap(map, ids).filter((i) => i.target === 'nav:2')).toHaveLength(1);
    map.nav.edges.push({ from: 1, to: 2, type: 'jump' });
    expect(validateMap(map, ids).filter((i) => i.target === 'nav:2')).toHaveLength(0);
  });
});
