import { MapDefSchema } from '@lawn/shared';
import type { Foothold, MapDef, MapLight, NavGraph, Portal, SpawnZone } from '@lawn/shared';
import { buildCollisionShapes } from './collision';
import { Fields } from './fields';
import type { LdtkEntityInstance, LdtkLayerInstance, LdtkLevel, LdtkProject, LdtkTilesetDef } from './types';

export interface ConvertIssue {
  level: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ConvertOptions {
  /** 導航圖產生器（`@lawn/shared` 的 buildNavGraph）；未提供時輸出空的 nav。 */
  buildNav?: (map: MapDef) => NavGraph;
  /** LDtk tileset identifier → content/ 相對路徑。預設 `tilesets/{identifier}.png`。 */
  tilesetPath?: (identifier: string) => string;
}

export interface LevelResult {
  level: string;
  map: MapDef | null;
  issues: ConvertIssue[];
}

export interface ConvertResult {
  maps: MapDef[];
  levels: LevelResult[];
  issues: ConvertIssue[];
}

const ROOM_NAME = /^Room(\d+)$/;
const EMPTY_NAV: NavGraph = { nodes: [], edges: [] };

/** 取出所有關卡（相容多世界模式）。 */
export function allLevels(project: LdtkProject): LdtkLevel[] {
  const fromWorlds = project.worlds?.flatMap((w) => w.levels) ?? [];
  return fromWorlds.length > 0 ? fromWorlds : project.levels;
}

/**
 * 「關卡分開存檔」的專案：讀入每個關卡的 .ldtkl，回傳 layerInstances 都填好的專案。
 * readJson 的路徑相對 .ldtk 檔所在資料夾。
 */
export async function loadExternalLevels(
  project: LdtkProject,
  readJson: (relPath: string) => Promise<unknown>,
): Promise<LdtkProject> {
  const load = async (level: LdtkLevel): Promise<LdtkLevel> =>
    level.layerInstances === null && level.externalRelPath
      ? ((await readJson(level.externalRelPath)) as LdtkLevel)
      : level;
  return {
    ...project,
    levels: await Promise.all(project.levels.map(load)),
    worlds: project.worlds
      ? await Promise.all(project.worlds.map(async (w) => ({ ...w, levels: await Promise.all(w.levels.map(load)) })))
      : undefined,
  };
}

export function convertLdtkProject(project: LdtkProject, options: ConvertOptions = {}): ConvertResult {
  const levels = allLevels(project).map((level) => convertLevel(project, level, options));
  const issues = levels.flatMap((l) => l.issues);
  const seen = new Map<string, string>();
  for (const l of levels) {
    if (!l.map) continue;
    const other = seen.get(l.map.id);
    if (other) issues.push({ level: l.level, severity: 'error', message: `地圖 ID ${l.map.id} 與關卡 ${other} 重複` });
    else seen.set(l.map.id, l.level);
  }
  return {
    maps: levels.flatMap((l) => (l.map ? [l.map] : [])),
    levels,
    issues,
  };
}

export function convertLevel(project: LdtkProject, level: LdtkLevel, options: ConvertOptions = {}): LevelResult {
  const issues: ConvertIssue[] = [];
  const error = (message: string) => issues.push({ level: level.identifier, severity: 'error', message });
  const warn = (message: string) => issues.push({ level: level.identifier, severity: 'warning', message });
  const result = (map: MapDef | null): LevelResult => ({ level: level.identifier, map, issues });

  if (!level.layerInstances) {
    error('關卡資料是分開存檔的，請先用 loadExternalLevels 讀入');
    return result(null);
  }

  const fields = new Fields(level.fieldInstances);
  const roomId = fields.number('roomId') ?? Number(ROOM_NAME.exec(level.identifier)?.[1] ?? NaN);
  if (!Number.isInteger(roomId) || roomId < 1) {
    error('缺少 roomId 欄位，關卡名稱也不是 RoomNN');
    return result(null);
  }
  const theme = fields.string('theme') ?? '';
  if (!theme) error('缺少 theme 欄位');
  const bgm = fields.string('bgm') ?? '';
  if (!bgm) warn('沒有設定 bgm');

  const layers = level.layerInstances;
  const tilesets = new Map(project.defs.tilesets.map((t) => [t.uid, t]));
  const tilesetPath = options.tilesetPath ?? ((id: string) => `tilesets/${id}.png`);

  // 碰撞
  const collision = layers.find((l) => l.__identifier === 'Collision');
  if (!collision) error('找不到 Collision 圖層');
  const shapes = collision
    ? buildCollisionShapes({
        cWid: collision.__cWid,
        cHei: collision.__cHei,
        gridSize: collision.__gridSize,
        cells: collision.intGridCsv,
      })
    : { footholds: [], walls: [], ceilings: [], climbables: [], unknownCells: [] };
  if (collision && collision.__gridSize !== 16) error(`Collision 格子大小是 ${collision.__gridSize}，必須是 16`);
  for (const [cx, cy, v] of shapes.unknownCells.slice(0, 5)) warn(`Collision (${cx}, ${cy}) 的值 ${v} 不認得，視為空格`);
  if (shapes.unknownCells.length > 5) warn(`還有 ${shapes.unknownCells.length - 5} 格不認得的 Collision 值`);

  // 圖塊層：LDtk 第一個是最上層，輸出要由下往上
  const tileLayers: MapDef['tileLayers'] = [];
  for (const layer of [...layers].reverse()) {
    const tiles = layer.__type === 'Tiles' ? layer.gridTiles : layer.autoLayerTiles;
    if (tiles.length === 0) continue;
    const tileset = tilesets.get(layer.overrideTilesetUid ?? layer.__tilesetDefUid ?? -1);
    if (!tileset) {
      warn(`圖層 ${layer.__identifier} 有圖塊但沒有 tileset，略過`);
      continue;
    }
    checkTileset(tileset, warn);
    const ox = layer.__pxTotalOffsetX;
    const oy = layer.__pxTotalOffsetY;
    tileLayers.push({
      name: layer.__identifier,
      tileset: tilesetPath(tileset.identifier),
      z: /front/i.test(layer.__identifier) ? 'front' : 'back',
      tiles: tiles.map((t) => [t.px[0] + ox, t.px[1] + oy, t.t, t.f & 3]),
    });
  }

  // 實體
  const entities = layers
    .filter((l) => l.__type === 'Entities')
    .flatMap((l) => l.entityInstances.map((e) => ({ e, layer: l })));
  const portals: Portal[] = [];
  const spawnZones: SpawnZone[] = [];
  const lights: MapLight[] = [];
  const waveEntries: MapDef['waveEntries'] = [];
  const decors: MapDef['decors'] = [];
  let boss: MapDef['boss'];

  for (const { e, layer } of entities) {
    const f = new Fields(e.fieldInstances);
    const [x, y] = entityPoint(e, layer);
    const where = `${e.__identifier} (${x}, ${y})`;
    switch (e.__identifier) {
      case 'PlayerSpawn': {
        const n = portals.filter((p) => p.type === 'spawn').length;
        if (n > 0) warn(`有多個 PlayerSpawn，${where} 之後的不會被使用`);
        portals.push({ id: n === 0 ? 'spawn' : `spawn_${n + 1}`, type: 'spawn', x, y });
        break;
      }
      case 'Portal': {
        const type = f.string('type');
        if (type !== 'next' && type !== 'prev' && type !== 'toRoom') {
          error(`${where} 的 type 必須是 next／prev／toRoom，目前是 ${String(type)}`);
          break;
        }
        const toRoom = f.number('toRoom');
        if (type === 'toRoom' && toRoom === undefined) error(`${where} 是 toRoom 但沒有填 toRoom`);
        portals.push({ id: e.iid, type, x, y, ...(type === 'toRoom' && toRoom !== undefined ? { toRoom } : {}) });
        break;
      }
      case 'SpawnZone': {
        const rect = entityRect(e, layer);
        const pool = parseMobPool(f.strings('mobs') ?? [], (m) => error(`${where}：${m}`));
        if (pool.length === 0) error(`${where} 沒有設定 mobs`);
        spawnZones.push({
          id: e.iid,
          rect,
          footholdIds: shapes.footholds.filter((fh) => footholdIntersectsRect(fh, rect)).map((fh) => fh.id),
          maxCount: f.number('maxCount') ?? 5,
          respawnSec: f.number('respawnSec') ?? 5,
          pool,
        });
        break;
      }
      case 'WaveEntry': {
        const dirField = f.raw('dir');
        let dir: 1 | -1 = x < level.pxWid / 2 ? 1 : -1;
        if (dirField === 1 || dirField === 'right') dir = 1;
        else if (dirField === -1 || dirField === 'left') dir = -1;
        else if (dirField !== undefined) warn(`${where} 的 dir 不認得，改用朝向地圖中央`);
        waveEntries.push({ x, y, dir });
        break;
      }
      case 'BossSpawn': {
        const mobId = f.string('mobId');
        const intervalSec = f.number('intervalSec');
        if (boss) warn(`有多個 BossSpawn，只使用第一個`);
        else if (!mobId || intervalSec === undefined) error(`${where} 缺少 mobId 或 intervalSec`);
        else boss = { mobId, x, y, intervalSec };
        break;
      }
      case 'Light': {
        const flicker = f.raw('flicker');
        lights.push({
          x,
          y,
          color: f.string('color') ?? '#ffffff',
          radius: f.number('radius') ?? 64,
          intensity: f.number('intensity') ?? 1,
          flicker: typeof flicker === 'number' ? flicker : flicker === true ? 1 : 0,
        });
        break;
      }
      case 'Decor': {
        const rect = f.tile('tile') ?? e.__tile ?? undefined;
        const tileset = rect ? tilesets.get(rect.tilesetUid) : undefined;
        if (!rect || !tileset) {
          error(`${where} 沒有設定圖塊`);
          break;
        }
        const g = tileset.tileGridSize;
        if (rect.w > g || rect.h > g) warn(`${where} 的圖塊大於一格，目前只會顯示左上角那一格`);
        const [left, top] = entityTopLeft(e, layer);
        decors.push({
          tileset: tilesetPath(tileset.identifier),
          tileId: Math.floor(rect.y / g) * tileset.__cWid + Math.floor(rect.x / g),
          x: left,
          y: top,
          z: f.string('layer') === 'front' ? 'front' : 'back',
          flipX: f.bool('flipX') ?? false,
        });
        break;
      }
      default:
        warn(`不認得的實體 ${where}，略過`);
    }
  }

  const map: MapDef = {
    schemaVersion: 1,
    id: `map_${String(roomId).padStart(4, '0')}`,
    name: level.identifier,
    theme,
    bgm,
    tileSize: 16,
    size: { w: level.pxWid, h: level.pxHei },
    cameraBounds: { x: 0, y: 0, w: level.pxWid, h: level.pxHei },
    tileLayers,
    decors,
    lights,
    footholds: shapes.footholds,
    walls: shapes.walls,
    ceilings: shapes.ceilings,
    climbables: shapes.climbables,
    portals,
    spawnZones,
    waveEntries,
    ...(boss ? { boss } : {}),
    nav: EMPTY_NAV,
  };
  if (options.buildNav) map.nav = options.buildNav(map);

  const parsed = MapDefSchema.safeParse(map);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) error(`格式錯誤 ${issue.path.join('.')}：${issue.message}`);
  }
  return result(map);
}

function checkTileset(t: LdtkTilesetDef, warn: (m: string) => void) {
  if (t.tileGridSize !== 16) warn(`tileset ${t.identifier} 的格子大小是 ${t.tileGridSize}，應為 16`);
  if (t.spacing !== 0 || t.padding !== 0) warn(`tileset ${t.identifier} 有 spacing／padding，遊戲端不支援`);
}

/** 實體的 pivot 點（地圖座標）。 */
function entityPoint(e: LdtkEntityInstance, layer: LdtkLayerInstance): [number, number] {
  return [e.px[0] + layer.__pxTotalOffsetX, e.px[1] + layer.__pxTotalOffsetY];
}

function entityTopLeft(e: LdtkEntityInstance, layer: LdtkLayerInstance): [number, number] {
  const [x, y] = entityPoint(e, layer);
  return [x - e.__pivot[0] * e.width, y - e.__pivot[1] * e.height];
}

function entityRect(e: LdtkEntityInstance, layer: LdtkLayerInstance) {
  const [x, y] = entityTopLeft(e, layer);
  return { x, y, w: e.width, h: e.height };
}

/** `mob_0001:3` → { mobId, weight }；沒寫權重視為 1。 */
export function parseMobPool(entries: string[], onError: (message: string) => void): SpawnZone['pool'] {
  const pool: SpawnZone['pool'] = [];
  for (const raw of entries) {
    const [mobId = '', weightText] = raw.trim().split(':');
    const weight = weightText === undefined ? 1 : Number(weightText);
    if (!mobId || !Number.isFinite(weight) || weight <= 0) {
      onError(`mobs 的 "${raw}" 格式錯誤，應為 mob_0001 或 mob_0001:3`);
      continue;
    }
    pool.push({ mobId, weight });
  }
  return pool;
}

/** 折線是否有任何一段與矩形相交（Liang–Barsky）。 */
export function footholdIntersectsRect(fh: Foothold, r: { x: number; y: number; w: number; h: number }): boolean {
  for (let i = 0; i < fh.points.length - 1; i++) {
    const [x1, y1] = fh.points[i]!;
    const [x2, y2] = fh.points[i + 1]!;
    if (segmentIntersectsRect(x1, y1, x2, y2, r)) return true;
  }
  return false;
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, x1 - r.x) && clip(dx, r.x + r.w - x1) && clip(-dy, y1 - r.y) && clip(dy, r.y + r.h - y1) && t0 <= t1
  );
}
