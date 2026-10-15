/** 地圖驗證（STUDIO_SPEC §6.3）。 */
import { MapDefSchema, buildNavGraph, reachableFrom } from '@lawn/shared';
import type { MapDef } from '@lawn/shared';
import type { Issue } from '../state/validation';
import { footholdUnder } from './geometry';

const ROOM_COUNT = 20;

export function validateMaps(maps: MapDef[]): Issue[] {
  const ids = new Set(maps.map((m) => m.id));
  return maps.flatMap((m) => validateMap(m, ids));
}

export function validateMap(map: MapDef, mapIds: Set<string>): Issue[] {
  const issues: Issue[] = [];
  const path = `maps/${map.id}.json`;
  const error = (message: string, target = map.id) => issues.push({ severity: 'error', page: 'map', path, target, message: `${map.id}：${message}` });
  const warn = (message: string, target = map.id) => issues.push({ severity: 'warning', page: 'map', path, target, message: `${map.id}：${message}` });

  const parsed = MapDefSchema.safeParse(map);
  if (!parsed.success) {
    for (const i of parsed.error.issues) error(`格式錯誤 ${i.path.map(String).join('.')}：${i.message}`);
    return issues;
  }

  // 傳送點
  const portalIds = new Set<string>();
  for (const p of map.portals) {
    if (portalIds.has(p.id)) error(`傳送點 ID ${p.id} 重複`, `portal:${p.id}`);
    portalIds.add(p.id);
    if (!footholdUnder(map, p.x, p.y)) {
      if (p.type === 'spawn') error(`出生點 (${p.x}, ${p.y}) 不在地面上`, `portal:${p.id}`);
      else warn(`傳送點 ${p.type} (${p.x}, ${p.y}) 不在地面上`, `portal:${p.id}`);
    }
    if (p.type === 'toRoom') {
      if (p.toRoom === undefined) error(`指定房傳送點沒有設定 toRoom`, `portal:${p.id}`);
      else if (p.toRoom < 1 || p.toRoom > ROOM_COUNT) error(`傳送點目標房 ${p.toRoom} 超出 1–${ROOM_COUNT}`, `portal:${p.id}`);
      else if (!mapIds.has(`map_${String(p.toRoom).padStart(4, '0')}`)) error(`傳送點目標房 ${p.toRoom} 的地圖不存在`, `portal:${p.id}`);
    }
  }
  const has = (type: string) => map.portals.some((p) => p.type === type);
  if (!has('spawn')) error('沒有出生點（PlayerSpawn）');
  if (!has('next')) error('沒有「下一房」傳送點');
  if (!has('prev')) error('沒有「上一房」傳送點');

  // 生怪區
  if (map.spawnZones.length === 0) warn('沒有生怪區');
  for (const z of map.spawnZones) {
    if (z.footholdIds.length === 0) error(`生怪區 ${shortId(z.id)} 不在任何足場上`, `zone:${z.id}`);
  }

  // 怪潮、Boss
  if (map.waveEntries.length === 0) warn('沒有怪潮湧入點（WaveEntry）');
  if (map.boss && !footholdUnder(map, map.boss.x, map.boss.y)) warn(`Boss 出生點 (${map.boss.x}, ${map.boss.y}) 不在地面上`, 'boss');

  // 可達性：用遊戲同一套導航圖（nav 為空時遊戲會現場 buildNavGraph，這裡也一樣）
  const nav = map.nav.edges.length > 0 ? map.nav : buildNavGraph(map);
  const spawn = map.portals.find((p) => p.type === 'spawn');
  const start = spawn ? footholdUnder(map, spawn.x, spawn.y) : undefined;
  if (start) {
    const reached = reachableFrom(nav, start.id);
    for (const p of map.portals) {
      if (p.type === 'spawn') continue;
      const fh = footholdUnder(map, p.x, p.y);
      if (!fh || reached.has(fh.id)) continue;
      // 自動掛機換房會走去「下一房」傳送點，走不到就會卡在這房
      if (p.type === 'next') error(`自動掛機從出生點走不到「下一房」傳送點（足場 #${fh.id}）`, `portal:${p.id}`);
      else warn(`從出生點走不到${p.type === 'prev' ? '「上一房」' : '指定房'}傳送點（足場 #${fh.id}）`, `portal:${p.id}`);
    }
    for (const fh of map.footholds) {
      if (!reached.has(fh.id)) warn(`平台（足場 #${fh.id}）從出生點走不到`, `fh:${fh.id}`);
    }
  }
  return issues;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
