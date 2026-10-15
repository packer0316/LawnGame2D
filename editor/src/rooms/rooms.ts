/** 房間表（STUDIO_SPEC §7）：預設值與驗證。 */
import { BetLevelFileVersioned, RoomFileSchema } from '@lawn/shared';
import type { MapDef, MonsterTier, RoomDef, RoomFile } from '@lawn/shared';
import type { Issue } from '../state/validation';

export const ROOM_COUNT = 20;
export const roomMapId = (roomId: number) => `map_${String(roomId).padStart(4, '0')}`;

/** 地圖上出現的怪物（依生怪區權重加總排序）。 */
export function mapLineup(map: MapDef): string[] {
  const weight = new Map<string, number>();
  for (const z of map.spawnZones) for (const p of z.pool) weight.set(p.mobId, (weight.get(p.mobId) ?? 0) + p.weight);
  return [...weight].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** 沒有押注等級表時的預設範圍。 */
export const DEFAULT_BET_RANGE: [number, number] = [1, 10000];

/** 預設押注範圍：每房都能用押注等級表的全部級距（使用者決定）。 */
export function defaultBetRange(bets?: number[]): [number, number] {
  return bets?.length ? [bets[0]!, bets[bets.length - 1]!] : [...DEFAULT_BET_RANGE];
}

export interface RoomDefaults {
  /** 押注等級（content/class/bet-levels.json）。 */
  bets?: number[];
  /** 怪物等級（math/monsters.math.json）：Boss 不放進怪潮。 */
  tiers?: Map<string, MonsterTier>;
}

/** 依地圖產生房間的預設設定。 */
export function defaultRoom(roomId: number, map: MapDef | undefined, { bets, tiers }: RoomDefaults = {}): RoomDef {
  const lineup = (map ? mapLineup(map) : []).filter((id) => tiers?.get(id) !== 'boss');
  const room: RoomDef = {
    id: roomId,
    mapId: roomMapId(roomId),
    name: map?.name ?? `房間 ${roomId}`,
    betRange: defaultBetRange(bets),
    ...(lineup.length ? { lineup } : {}),
  };
  if (map?.boss) room.boss = { mobId: map.boss.mobId, intervalSec: map.boss.intervalSec };
  if (map && map.waveEntries.length > 0 && lineup.length > 0) {
    room.wave = {
      everySec: [300, 480],
      durationSec: 40,
      pool: lineup.slice(0, 3).map((mobId, i) => ({ mobId, weight: 3 - i })),
      maxMonsters: 150,
    };
  }
  return room;
}

export interface RoomContext {
  maps: Map<string, MapDef>;
  monsters: Set<string>;
  /** 押注等級（有 content/class/bet-levels.json 時）。 */
  bets?: number[];
  /** 怪物等級（有 math/monsters.math.json 時），用來檢查 Boss 的擺放。 */
  tiers?: Map<string, MonsterTier>;
}

/**
 * Boss 只透過 BossSpawn／RoomDef.boss 定時出現（SPEC §3.8）：
 * 一般生怪區與怪潮的怪物池都不能有 tier 為 boss 的怪物。
 */
export function validateBossPlacement(maps: Iterable<MapDef>, rooms: RoomFile | undefined, tiers: Map<string, MonsterTier>): Issue[] {
  const issues: Issue[] = [];
  const isBoss = (id: string) => tiers.get(id) === 'boss';
  for (const m of maps) {
    for (const z of m.spawnZones) {
      const bosses = z.pool.filter((p) => isBoss(p.mobId)).map((p) => p.mobId);
      if (bosses.length) {
        issues.push({
          severity: 'error',
          page: 'map',
          path: `maps/${m.id}.json`,
          target: `${m.id}:zone:${z.id}`,
          message: `${m.id}：生怪區的怪物池有 Boss ${bosses.join('、')}（Boss 只能用 BossSpawn 定時出現，請在 LDtk 的 SpawnZone.mobs 移除）`,
        });
      }
    }
  }
  for (const r of rooms?.rooms ?? []) {
    const bosses = (r.wave?.pool ?? []).filter((p) => isBoss(p.mobId)).map((p) => p.mobId);
    if (bosses.length) {
      issues.push({ severity: 'error', page: 'rooms', path: 'rooms/rooms.json', target: `room:${r.id}`, message: `房間 ${r.id} 的怪潮怪物池有 Boss ${bosses.join('、')}` });
    }
    if (r.boss && tiers.size > 0 && !isBoss(r.boss.mobId)) {
      issues.push({ severity: 'warning', page: 'rooms', path: 'rooms/rooms.json', target: `room:${r.id}`, message: `房間 ${r.id} 的 Boss ${r.boss.mobId} 在數值檔不是 boss 等級` });
    }
  }
  return issues;
}

export function validateRooms(file: RoomFile | undefined, ctx: RoomContext): Issue[] {
  const path = 'rooms/rooms.json';
  const issues: Issue[] = [];
  const err = (message: string, target?: string) => issues.push({ severity: 'error', page: 'rooms', path, target, message });
  const warn = (message: string, target?: string) => issues.push({ severity: 'warning', page: 'rooms', path, target, message });

  if (ctx.tiers) issues.push(...validateBossPlacement(ctx.maps.values(), file, ctx.tiers));
  if (!file) {
    if (ctx.maps.size > 0) warn('還沒有房間表（rooms/rooms.json），請到「房間表」頁從地圖產生');
    return issues;
  }
  const parsed = RoomFileSchema.safeParse(file);
  if (!parsed.success) for (const i of parsed.error.issues) err(`房間表 ${i.path.map(String).join('.')}：${i.message}`);

  const seen = new Set<number>();
  for (const r of file.rooms) {
    const t = `room:${r.id}`;
    const name = `房間 ${r.id}`;
    if (seen.has(r.id)) err(`${name} 重複`, t);
    seen.add(r.id);
    if (r.id < 1 || r.id > ROOM_COUNT) err(`${name} 的編號超出 1–${ROOM_COUNT}`, t);
    const map = ctx.maps.get(r.mapId);
    if (!map) err(`${name} 的地圖 ${r.mapId} 不存在`, t);
    if (r.betRange[0] > r.betRange[1]) err(`${name} 的押注範圍下限大於上限`, t);
    if (ctx.bets?.length) {
      for (const b of r.betRange) if (!ctx.bets.includes(b)) warn(`${name} 的押注 ${b} 不在押注等級表中`, t);
    }
    for (const mobId of r.lineup ?? []) if (!ctx.monsters.has(mobId)) warn(`${name} 的怪物組成 ${mobId} 不存在`, t);
    if (r.boss) {
      if (!ctx.monsters.has(r.boss.mobId)) err(`${name} 的 Boss ${r.boss.mobId} 不存在`, t);
      if (map && !map.boss) err(`${name} 設定了 Boss，但地圖 ${r.mapId} 沒有 BossSpawn 位置`, t);
    }
    if (r.wave) {
      for (const p of r.wave.pool) if (!ctx.monsters.has(p.mobId)) err(`${name} 的怪潮怪物 ${p.mobId} 不存在`, t);
      if (r.wave.everySec[0] > r.wave.everySec[1]) err(`${name} 的怪潮間隔下限大於上限`, t);
      if (map && map.waveEntries.length === 0) err(`${name} 有怪潮，但地圖 ${r.mapId} 沒有怪潮湧入點`, t);
    }
  }
  for (let id = 1; id <= ROOM_COUNT; id++) {
    if (seen.has(id)) continue;
    if (ctx.maps.has(roomMapId(id))) err(`房間 ${id} 有地圖但沒有在房間表中`, `room:${id}`);
    else warn(`房間 ${id} 尚未設定`, `room:${id}`);
  }
  return issues;
}

/** content/class/bet-levels.json 的押注值（遊戲端手寫、編輯器唯讀）；格式不符時回傳空陣列。 */
export function parseBetLevels(raw: unknown): number[] {
  const result = BetLevelFileVersioned.safeMigrate(raw);
  return result.success ? result.data.levels.map((l) => l.bet).sort((a, b) => a - b) : [];
}
