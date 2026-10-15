import type { RoomFile } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { buildLdtkProject } from '../../tools/fixtures/src/ldtkBuilder';
import { generateRoom } from '../../tools/fixtures/src/rooms';
import { convertLdtkProject } from '../ldtk/convert';
import { defaultBetRange, defaultRoom, mapLineup, parseBetLevels, validateRooms } from './rooms';

const maps = convertLdtkProject(
  buildLdtkProject(Array.from({ length: 20 }, (_, i) => generateRoom(i + 1)), [
    { identifier: 'forest', relPath: 'tilesets/forest.png', pxWid: 128, pxHei: 32 },
  ]),
).maps;
const mapById = new Map(maps.map((m) => [m.id, m]));
const monsters = new Set(['mob_0001', 'mob_0002', 'mob_0003', 'mob_0004', 'mob_0005', 'mob_0006']);
const full: RoomFile = { schemaVersion: 1, rooms: maps.map((m, i) => defaultRoom(i + 1, m)) };

describe('房間表', () => {
  it('從地圖產生的 20 房沒有錯誤', () => {
    expect(validateRooms(full, { maps: mapById, monsters }).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('預設值：Boss 與怪潮依地圖', () => {
    const r5 = full.rooms[4]!;
    expect(r5.boss).toEqual({ mobId: 'mob_0006', intervalSec: 300 });
    expect(r5.wave?.maxMonsters).toBe(150);
    expect(r5.lineup).toEqual(mapLineup(maps[4]!));
  });

  it('有地圖卻沒有房間是錯誤；Boss 沒有出生位置是錯誤', () => {
    const file: RoomFile = { schemaVersion: 1, rooms: full.rooms.filter((r) => r.id !== 3) };
    const room1 = { ...file.rooms[0]!, boss: { mobId: 'mob_0001', intervalSec: 60 } };
    file.rooms[0] = room1;
    const errors = validateRooms(file, { maps: mapById, monsters }).filter((i) => i.severity === 'error').map((i) => i.message);
    expect(errors).toEqual(['房間 1 設定了 Boss，但地圖 map_0001 沒有 BossSpawn 位置', '房間 3 有地圖但沒有在房間表中']);
  });

  it('不存在的怪物與地圖', () => {
    const file: RoomFile = {
      schemaVersion: 1,
      rooms: [{ ...full.rooms[0]!, mapId: 'map_0099', wave: { everySec: [300, 400], durationSec: 30, pool: [{ mobId: 'mob_0777', weight: 1 }], maxMonsters: 100 } }],
    };
    const errors = validateRooms(file, { maps: mapById, monsters: new Set<string>() }).filter((i) => i.severity === 'error').map((i) => i.message);
    expect(errors).toContain('房間 1 的地圖 map_0099 不存在');
    expect(errors).toContain('房間 1 的怪潮怪物 mob_0777 不存在');
  });

  it('預設押注範圍：每房都用押注等級表的全部級距', () => {
    const bets = [1, 5, 10, 20, 30, 40, 50, 100, 150, 200, 250, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000];
    expect(defaultBetRange(bets)).toEqual([1, 10000]);
    expect(defaultBetRange()).toEqual([1, 10000]);
    expect(defaultRoom(20, maps[19], { bets }).betRange).toEqual([1, 10000]);
  });

  it('押注等級表：不在表中是警告', () => {
    const file: RoomFile = { schemaVersion: 1, rooms: [{ ...full.rooms[0]!, betRange: [1, 7] }] };
    const issues = validateRooms(file, { maps: mapById, monsters, bets: [1, 2, 5, 10] });
    expect(issues).toContainEqual(expect.objectContaining({ severity: 'warning', message: '房間 1 的押注 7 不在押注等級表中' }));
  });

  it('Boss 不能出現在一般生怪區與怪潮（SPEC §3.8）', () => {
    const tiers = new Map<string, 'normal' | 'boss'>([['mob_0001', 'normal'], ['mob_0006', 'boss']]);
    const map = structuredClone(maps[0]!);
    map.spawnZones[0]!.pool.push({ mobId: 'mob_0006', weight: 1 });
    const room = { ...defaultRoom(1, map, { tiers }), wave: { everySec: [300, 400] as [number, number], durationSec: 30, pool: [{ mobId: 'mob_0006', weight: 1 }], maxMonsters: 100 } };
    const errors = validateRooms({ schemaVersion: 1, rooms: [room] }, { maps: new Map([[map.id, map]]), monsters, tiers }).filter((i) => i.severity === 'error').map((i) => i.message);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('生怪區的怪物池有 Boss mob_0006'), expect.stringContaining('房間 1 的怪潮怪物池有 Boss mob_0006')]));
  });

  it('預設怪潮不放 Boss', () => {
    const tiers = new Map<string, 'normal' | 'boss'>([['mob_0001', 'boss']]);
    const room = defaultRoom(5, maps[4]!, { tiers });
    expect(room.wave?.pool.some((p) => p.mobId === 'mob_0001')).toBe(false);
    expect(room.lineup?.includes('mob_0001')).toBe(false);
  });

  it('parseBetLevels 用遊戲端的 schema', () => {
    expect(parseBetLevels({ schemaVersion: 1, levels: [{ bet: 10, visualTier: 2 }, { bet: 1, visualTier: 1 }] })).toEqual([1, 10]);
    expect(parseBetLevels([{ bet: 5 }])).toEqual([]);
    expect(parseBetLevels(null)).toEqual([]);
  });
});
