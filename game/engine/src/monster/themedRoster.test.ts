import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { MonsterDefFile } from '@lawn/shared';
import { loadContentBundle, type ContentBundle } from '../content/bundle';
import { applyThemedRosters, themedMonsterId } from './themedRoster';

let original: ContentBundle, themed: ContentBundle;
beforeAll(async () => {
  original = await loadContentBundle({
    async json<T>(path: string): Promise<T> { return JSON.parse(await readFile(new URL(`../../../../content/${path}`, import.meta.url), 'utf8')); },
    async imageUrl(path) { return `original/${path}`; },
  });
  themed = applyThemedRosters(original);
});

describe('shipped map monster art pack', () => {
  it('provides four distinct creatures per shipped room with complete, feet-aligned animation states', () => {
    const names = new Set<string>();
    // 每種場景只留 1 房（SPEC v1.2）：只檢查 rooms.json 有用到的地圖
    const maps = original.rooms.map(room => Number(room.mapId.slice(4)));
    expect(maps.length).toBeGreaterThan(0);
    for (const map of maps) {
      const entries = Array.from({ length: 4 }, (_, role) => themed.monsters.get(themedMonsterId(map, role))!);
      expect(entries.every(Boolean)).toBe(true);
      expect(entries[3]!.def.hitbox.h).toBeGreaterThan(entries[0]!.def.hitbox.h * 2);
      expect(entries[3]!.def.behavior.speed).toBeLessThan(entries[0]!.def.behavior.speed);
      entries.forEach(({ def, sheet }, role) => {
        expect(() => MonsterDefFile.migrate(def)).not.toThrow(); names.add(def.name);
        expect(sheet.presentation!.scale).toBeGreaterThan(0);
        expect(def.behavior.move).toBe(role === 2 ? 'fly' : 'ground');
        for (const [state, count] of [['idle', 2], ['move', 4], ['hit', 2], ['die', 4]] as const) {
          const tag = sheet.sheet.tags.get(def.tags[state])!;
          expect(tag.to - tag.from + 1).toBe(count);
          expect(tag.from).toBeGreaterThanOrEqual(role * 12);
          expect(tag.to).toBeLessThan((role + 1) * 12);
          for (let index = tag.from; index <= tag.to; index++) {
            const frame = sheet.sheet.frame(null, index)!;
            expect(frame.rect.w).toBeGreaterThan(10);
            expect(frame.rect.h).toBeGreaterThan(10);
            expect(frame.rect.x + frame.rect.w).toBeLessThanOrEqual(1086);
            expect(frame.rect.y + frame.rect.h).toBeLessThanOrEqual(1448);
            expect(frame.sourceRect.y + frame.sourceRect.h).toBe(frame.sourceSize.h);
          }
        }
      });
    }
    expect(names.size).toBe(maps.length * 4);
  });

  it('replaces all spawn/wave pools without changing their multiplier distribution or source content', async () => {
    const distribution = (bundle: ContentBundle, pool: {mobId:string;weight:number}[]) => {
      const total = pool.reduce((n, e) => n + e.weight, 0), result: Record<string, number> = {};
      for (const entry of pool) {
        const { id: _, ...math } = bundle.monsters.get(entry.mobId)!.math!;
        const key = JSON.stringify(math); result[key] = (result[key] ?? 0) + entry.weight / total;
      }
      return result;
    };
    const compare = (before: {mobId:string;weight:number}[], after: typeof before) => {
      const a = distribution(original, before), b = distribution(themed, after);
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const key of Object.keys(a)) expect(b[key]).toBeCloseTo(a[key]!, 12);
    };
    for (const room of themed.rooms) {
      const before = original.rooms.find(r => r.id === room.id)!;
      expect(room.lineup).toHaveLength(4);
      expect(before.lineup).toHaveLength(3);
      const oldMap = await original.loadMap(room.mapId), snapshot = JSON.stringify(oldMap);
      const map = await themed.loadMap(room.mapId);
      const species = new Set(map.spawnZones.flatMap(z => z.pool.map(e => e.mobId)));
      expect([...species].map(id=>themed.monsters.get(id)!.def.name).sort()).toEqual(room.lineup!.map(id=>themed.monsters.get(id)!.def.name).sort());
      map.spawnZones.forEach((zone, i) => compare(oldMap.spawnZones[i]!.pool, zone.pool));
      if (room.wave) compare(before.wave!.pool, room.wave.pool);
      if (room.boss) {
        const { id: _, ...oldMath } = original.monsters.get(before.boss!.mobId)!.math!;
        const { id: __, ...newMath } = themed.monsters.get(room.boss.mobId)!.math!;
        expect(newMath).toEqual(oldMath);
      }
      expect(JSON.stringify(await original.loadMap(room.mapId))).toBe(snapshot);
    }
    expect(await themed.source.imageUrl('unrelated.png')).toBe('original/unrelated.png');
    expect(original.monsters.has('mob_0101')).toBe(false);
  });
});
