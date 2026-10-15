import { describe, expect, it } from 'vitest';
import { isValidId, idCategory } from './ids';
import { RoomFileVersioned } from './content';
import { versioned } from './versioned';
import { z } from 'zod';

describe('ID 規則', () => {
  it('{分類}_{4 位數}', () => {
    expect(isValidId('hair_0001')).toBe(true);
    expect(isValidId('faceAcc_0012')).toBe(true);
    expect(isValidId('hair_001')).toBe(false);
    expect(isValidId('Hair_0001')).toBe(false);
    expect(isValidId('mob_0003', 'mob')).toBe(true);
    expect(isValidId('mob_0003', 'map')).toBe(false);
    expect(idCategory('faceAcc_0012')).toBe('faceAcc');
  });
});

describe('versioned', () => {
  const V2 = versioned(z.object({ schemaVersion: z.literal(2), name: z.string() }), 2, {
    1: (raw) => ({ ...raw, name: raw.title, title: undefined }),
  });

  it('逐版升級後驗證', () => {
    expect(V2.migrate({ schemaVersion: 1, title: 'a' })).toEqual({ schemaVersion: 2, name: 'a' });
    expect(V2.migrate({ title: 'b' })).toEqual({ schemaVersion: 2, name: 'b' });
  });

  it('比程式新的版本回報錯誤', () => {
    const result = V2.safeMigrate({ schemaVersion: 3, name: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('內容 schema', () => {
  it('房間檔', () => {
    const rooms = RoomFileVersioned.migrate({
      schemaVersion: 1,
      rooms: [{ id: 1, mapId: 'map_0001', name: '迷霧森林', betRange: [1, 50] }],
    });
    expect(rooms.rooms[0]?.name).toBe('迷霧森林');
  });
});
