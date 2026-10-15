/** 地圖驗證（STUDIO_SPEC §6.3）。 */
import { MapDefSchema } from '@lawn/shared';
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

  // 到不了的平台（需要導航圖）
  if (map.nav.nodes.length > 0) {
    const spawn = map.portals.find((p) => p.type === 'spawn');
    const start = spawn ? footholdUnder(map, spawn.x, spawn.y) : undefined;
    const startNode = start ? map.nav.nodes.find((n) => n.footholdIds.includes(start.id)) : undefined;
    if (startNode) {
      const reached = new Set([startNode.id]);
      const queue = [startNode.id];
      while (queue.length > 0) {
        const id = queue.shift()!;
        for (const e of map.nav.edges) {
          if (e.from === id && !reached.has(e.to)) {
            reached.add(e.to);
            queue.push(e.to);
          }
        }
      }
      for (const n of map.nav.nodes) {
        if (!reached.has(n.id)) warn(`平台（導航節點 ${n.id}）從出生點走不到`, `nav:${n.id}`);
      }
    }
  }
  return issues;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
