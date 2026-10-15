import { MapDefSchema } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { buildLdtkProject } from '../../tools/fixtures/src/ldtkBuilder';
import { generateRoom } from '../../tools/fixtures/src/rooms';
import { convertLdtkProject, parseMobPool } from './convert';

const tilesets = ['forest', 'cave', 'ruins'].map((identifier) => ({
  identifier,
  relPath: `tilesets/${identifier}.png`,
  pxWid: 128,
  pxHei: 32,
}));

describe('convertLdtkProject（測試用 20 房）', () => {
  const project = buildLdtkProject(
    Array.from({ length: 20 }, (_, i) => generateRoom(i + 1)),
    tilesets,
  );
  const result = convertLdtkProject(project);

  it('20 房都轉換成功、沒有錯誤、通過 MapDef schema', () => {
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.maps).toHaveLength(20);
    for (const map of result.maps) expect(MapDefSchema.safeParse(map).success).toBe(true);
  });

  it('地圖 ID、主題與圖塊路徑', () => {
    const room8 = result.maps.find((m) => m.id === 'map_0008')!;
    expect(room8.name).toBe('Room08');
    expect(room8.theme).toBe('theme_0002');
    expect(room8.tileLayers.map((l) => [l.name, l.z, l.tileset])).toEqual([
      ['DecorBack', 'back', 'tilesets/cave.png'],
      ['Terrain', 'back', 'tilesets/cave.png'],
      ['DecorFront', 'front', 'tilesets/cave.png'],
    ]);
  });

  it('每房都有出生點、上一房與下一房傳送點，且站在地面上', () => {
    for (const map of result.maps) {
      const types = map.portals.map((p) => p.type);
      expect(types).toContain('spawn');
      expect(types).toContain('next');
      expect(types).toContain('prev');
      for (const p of map.portals) {
        const onGround = map.footholds.some((f) =>
          f.points.some(([x, y], i) => {
            const next = f.points[i + 1];
            return next !== undefined && p.x >= x && p.x <= next[0] && p.y === y && next[1] === y;
          }),
        );
        expect(onGround, `${map.id} ${p.type} (${p.x}, ${p.y})`).toBe(true);
      }
    }
  });

  it('生怪區有對應的地面，Boss 與指定房傳送點依房號出現', () => {
    for (const map of result.maps) {
      for (const z of map.spawnZones) expect(z.footholdIds.length, `${map.id} ${z.id}`).toBeGreaterThan(0);
      const room = Number(map.id.slice(4));
      expect(map.boss !== undefined).toBe(room % 5 === 0);
      expect(map.portals.some((p) => p.type === 'toRoom')).toBe(room % 4 === 0);
    }
  });

  it('有牆（左右邊牆）與繩梯', () => {
    for (const map of result.maps) {
      expect(map.walls.some((w) => w.x === 16 && w.side === -1)).toBe(true);
      expect(map.walls.some((w) => w.x === map.size.w - 16 && w.side === 1)).toBe(true);
      expect(map.climbables.length).toBeGreaterThan(0);
    }
  });
});

describe('parseMobPool', () => {
  it('解析權重，沒寫視為 1，格式錯誤回報', () => {
    const errors: string[] = [];
    expect(parseMobPool(['mob_0001:3', 'mob_0002', 'bad:x'], (m) => errors.push(m))).toEqual([
      { mobId: 'mob_0001', weight: 3 },
      { mobId: 'mob_0002', weight: 1 },
    ]);
    expect(errors).toHaveLength(1);
  });
});
