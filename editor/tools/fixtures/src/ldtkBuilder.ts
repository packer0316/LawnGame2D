/**
 * 產生測試用的 LDtk 專案（world.ldtk）。這台電腦沒有 LDtk，所以照 LDtk 1.5 的 JSON 格式自己組，
 * 圖塊也直接算好放進 autoLayerTiles（等同 LDtk 套用自動拼貼規則後的結果）。
 */
import type {
  LdtkEntityInstance,
  LdtkFieldInstance,
  LdtkLayerInstance,
  LdtkLevel,
  LdtkProject,
  LdtkTile,
  LdtkTilesetDef,
} from '../../../src/ldtk/types';

export const GRID = 16;

/** Collision 字元：. 空、# 實地、= 單向平台、/ 上坡、\ 下坡、| 繩索、H 梯子。其他字元是實體標記（該格碰撞為空）。 */
const COLLISION: Record<string, number> = { '#': 1, '=': 2, '/': 3, '\\': 4, '|': 5, H: 6 };

/** tileset 內的圖塊編號（每列 8 格）。 */
export const TILE = {
  grassTop: 0,
  dirt: 1,
  slopeUp: 2,
  slopeDown: 3,
  plank: 4,
  rope: 5,
  ladder: 6,
  dirtUnderSlope: 7,
  flower: 8,
  grass: 9,
  rock: 10,
  lamp: 11,
  bush: 12,
  crystal: 13,
} as const;

export interface SpawnZoneSpec {
  /** 格子座標的矩形 [cx, cy, cw, ch]。 */
  rect: [number, number, number, number];
  mobs: string[];
  maxCount: number;
  respawnSec: number;
}

export interface LightSpec {
  cx: number;
  cy: number;
  color: string;
  radius: number;
  intensity: number;
  flicker: number;
}

export interface RoomSpec {
  roomId: number;
  theme: string;
  tileset: string;
  bgm: string;
  /** Collision 與實體標記：S 出生點、N 下一房、P 上一房、T 指定房傳送點、W 怪潮湧入點、B Boss。 */
  rows: string[];
  spawnZones: SpawnZoneSpec[];
  lights: LightSpec[];
  bossMobId?: string;
  toRoom?: number;
  /** 背景裝飾（格子座標、圖塊編號）。 */
  decorBack: [number, number, number][];
  decorFront: [number, number, number][];
}

export interface TilesetSpec {
  identifier: string;
  relPath: string;
  pxWid: number;
  pxHei: number;
}

// 固定的 uid（LDtk 專案內唯一）
const UID = {
  layerEntities: 1,
  layerDecorFront: 2,
  layerCollision: 3,
  layerTerrain: 4,
  layerDecorBack: 5,
  entPlayerSpawn: 10,
  entPortal: 11,
  entSpawnZone: 12,
  entWaveEntry: 13,
  entBossSpawn: 14,
  entLight: 15,
  entDecor: 16,
  enumPortalType: 20,
  fieldRoomId: 30,
  fieldTheme: 31,
  fieldBgm: 32,
  fieldPortalType: 40,
  fieldPortalToRoom: 41,
  fieldZoneMax: 42,
  fieldZoneRespawn: 43,
  fieldZoneMobs: 44,
  fieldWaveDir: 45,
  fieldBossMob: 46,
  fieldBossInterval: 47,
  fieldLightColor: 48,
  fieldLightRadius: 49,
  fieldLightIntensity: 50,
  fieldLightFlicker: 51,
  fieldDecorTile: 52,
  fieldDecorLayer: 53,
  tilesetBase: 100,
  levelBase: 1000,
};

/** 可重現的假 UUID。 */
function makeIid(seed: number): string {
  const hex = (n: number, len: number) => (n >>> 0).toString(16).padStart(len, '0').slice(-len);
  const a = Math.imul(seed + 1, 2654435761);
  const b = Math.imul(seed + 7, 40503);
  return `${hex(a, 8)}-${hex(b, 4)}-4${hex(seed, 3)}-8${hex(a ^ b, 3)}-${hex(seed * 977, 4)}${hex(a + b, 8)}`;
}

function field(identifier: string, type: string, value: unknown, defUid: number): LdtkFieldInstance & { realEditorValues: unknown[] } {
  return { __identifier: identifier, __type: type, __value: value, defUid, realEditorValues: [] };
}

function fieldDef(identifier: string, type: string, uid: number, extra: Record<string, unknown> = {}) {
  return {
    identifier,
    doc: null,
    __type: type,
    uid,
    type: type.startsWith('LocalEnum') ? `F_Enum(${UID.enumPortalType})` : `F_${type.replace(/^Array<(.*)>$/, '$1')}`,
    isArray: type.startsWith('Array<'),
    canBeNull: true,
    arrayMinLength: null,
    arrayMaxLength: null,
    editorDisplayMode: 'ValueOnly',
    editorDisplayPos: 'Above',
    editorAlwaysShow: false,
    editorShowInWorld: true,
    editorCutLongValues: true,
    editorTextPrefix: null,
    editorTextSuffix: null,
    allowOutOfLevelRef: true,
    acceptFileTypes: null,
    defaultOverride: null,
    textLanguageMode: null,
    symmetricalRef: false,
    autoChainRef: true,
    allowedRefs: 'OnlySame',
    allowedRefsEntityUid: null,
    allowedRefTags: [],
    tilesetUid: null,
    searchable: false,
    min: null,
    max: null,
    regex: null,
    useForSmartColor: false,
    ...extra,
  };
}

function entityDef(identifier: string, uid: number, w: number, h: number, pivotX: number, pivotY: number, color: string, fieldDefs: unknown[]) {
  return {
    identifier,
    uid,
    tags: [],
    exportToToc: false,
    allowOutOfBounds: false,
    doc: null,
    width: w,
    height: h,
    resizableX: identifier === 'SpawnZone',
    resizableY: identifier === 'SpawnZone',
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    keepAspectRatio: false,
    tileOpacity: 1,
    fillOpacity: identifier === 'SpawnZone' ? 0.15 : 0.6,
    lineOpacity: 1,
    hollow: identifier === 'SpawnZone',
    color,
    renderMode: 'Rectangle',
    showName: true,
    tilesetId: null,
    tileRenderMode: 'FitInside',
    tileRect: null,
    uiTileRect: null,
    nineSliceBorders: [],
    maxCount: identifier === 'PlayerSpawn' || identifier === 'BossSpawn' ? 1 : 0,
    limitScope: 'PerLevel',
    limitBehavior: 'MoveLastOne',
    pivotX,
    pivotY,
    fieldDefs,
  };
}

function layerDef(identifier: string, type: string, uid: number, extra: Record<string, unknown> = {}) {
  return {
    __type: type,
    identifier,
    type,
    uid,
    doc: null,
    uiColor: null,
    gridSize: GRID,
    guideGridWid: 0,
    guideGridHei: 0,
    displayOpacity: 1,
    inactiveOpacity: 0.6,
    hideInList: false,
    hideFieldsWhenInactive: true,
    canSelectWhenInactive: true,
    renderInWorldView: true,
    pxOffsetX: 0,
    pxOffsetY: 0,
    parallaxFactorX: 0,
    parallaxFactorY: 0,
    parallaxScaling: true,
    requiredTags: [],
    excludedTags: [],
    autoTilesKilledByOtherLayerUid: null,
    uiFilterTags: [],
    useAsyncRender: false,
    intGridValues: [],
    intGridValuesGroups: [],
    autoRuleGroups: [],
    autoSourceLayerDefUid: null,
    tilesetDefUid: null,
    tilePivotX: 0,
    tilePivotY: 0,
    biomeFieldUid: null,
    ...extra,
  };
}

export function buildLdtkProject(rooms: RoomSpec[], tilesets: TilesetSpec[]): LdtkProject {
  const tilesetDefs: (LdtkTilesetDef & Record<string, unknown>)[] = tilesets.map((t, i) => ({
    __cWid: Math.floor(t.pxWid / GRID),
    __cHei: Math.floor(t.pxHei / GRID),
    identifier: t.identifier,
    uid: UID.tilesetBase + i,
    relPath: t.relPath,
    embedAtlas: null,
    pxWid: t.pxWid,
    pxHei: t.pxHei,
    tileGridSize: GRID,
    spacing: 0,
    padding: 0,
    tags: [],
    tagsSourceEnumUid: null,
    enumTags: [],
    customData: [],
    savedSelections: [],
    cachedPixelData: null,
  }));
  const tilesetUid = new Map(tilesetDefs.map((t) => [t.identifier, t.uid]));

  const defs = {
    layers: [
      layerDef('Entities', 'Entities', UID.layerEntities),
      layerDef('DecorFront', 'Tiles', UID.layerDecorFront, { tilesetDefUid: UID.tilesetBase }),
      layerDef('Collision', 'IntGrid', UID.layerCollision, {
        displayOpacity: 0.4,
        intGridValues: [
          { value: 1, identifier: 'solid', color: '#7A5230', tile: null, groupUid: 0 },
          { value: 2, identifier: 'oneWay', color: '#C9A15A', tile: null, groupUid: 0 },
          { value: 3, identifier: 'slopeUp', color: '#5E8C3A', tile: null, groupUid: 0 },
          { value: 4, identifier: 'slopeDown', color: '#3A8C6B', tile: null, groupUid: 0 },
          { value: 5, identifier: 'rope', color: '#D8C08A', tile: null, groupUid: 0 },
          { value: 6, identifier: 'ladder', color: '#B07A3A', tile: null, groupUid: 0 },
        ],
      }),
      layerDef('Terrain', 'AutoLayer', UID.layerTerrain, {
        autoSourceLayerDefUid: UID.layerCollision,
        tilesetDefUid: UID.tilesetBase,
      }),
      layerDef('DecorBack', 'Tiles', UID.layerDecorBack, { tilesetDefUid: UID.tilesetBase }),
    ],
    entities: [
      entityDef('PlayerSpawn', UID.entPlayerSpawn, 16, 32, 0.5, 1, '#3BC45A', []),
      entityDef('Portal', UID.entPortal, 32, 48, 0.5, 1, '#5AA7E6', [
        fieldDef('type', 'LocalEnum.PortalType', UID.fieldPortalType),
        fieldDef('toRoom', 'Int', UID.fieldPortalToRoom, { min: 1, max: 20 }),
      ]),
      entityDef('SpawnZone', UID.entSpawnZone, 64, 48, 0, 0, '#E65A5A', [
        fieldDef('maxCount', 'Int', UID.fieldZoneMax),
        fieldDef('respawnSec', 'Float', UID.fieldZoneRespawn),
        fieldDef('mobs', 'Array<String>', UID.fieldZoneMobs),
      ]),
      entityDef('WaveEntry', UID.entWaveEntry, 16, 32, 0.5, 1, '#E6A15A', [fieldDef('dir', 'Int', UID.fieldWaveDir)]),
      entityDef('BossSpawn', UID.entBossSpawn, 32, 48, 0.5, 1, '#B03AE6', [
        fieldDef('mobId', 'String', UID.fieldBossMob),
        fieldDef('intervalSec', 'Float', UID.fieldBossInterval),
      ]),
      entityDef('Light', UID.entLight, 16, 16, 0.5, 0.5, '#FFE27A', [
        fieldDef('color', 'Color', UID.fieldLightColor),
        fieldDef('radius', 'Float', UID.fieldLightRadius),
        fieldDef('intensity', 'Float', UID.fieldLightIntensity),
        fieldDef('flicker', 'Float', UID.fieldLightFlicker),
      ]),
      entityDef('Decor', UID.entDecor, 16, 16, 0, 0, '#9A9A9A', [
        fieldDef('tile', 'Tile', UID.fieldDecorTile),
        fieldDef('layer', 'String', UID.fieldDecorLayer),
      ]),
    ],
    tilesets: tilesetDefs,
    enums: [
      {
        identifier: 'PortalType',
        uid: UID.enumPortalType,
        values: ['next', 'prev', 'toRoom'].map((id) => ({ id, tileRect: null, color: 0 })),
        iconTilesetUid: null,
        externalRelPath: null,
        externalFileChecksum: null,
        tags: [],
      },
    ],
    externalEnums: [],
    levelFields: [
      fieldDef('roomId', 'Int', UID.fieldRoomId, { min: 1, max: 20 }),
      fieldDef('theme', 'String', UID.fieldTheme),
      fieldDef('bgm', 'String', UID.fieldBgm),
    ],
  };

  let worldX = 0;
  const levels = rooms.map((room, i) => {
    const level = buildLevel(room, UID.levelBase + i * 100, worldX, tilesetUid.get(room.tileset) ?? UID.tilesetBase);
    worldX += level.pxWid + 64;
    return level;
  });

  return {
    __header__: {
      fileType: 'LDtk Project JSON',
      app: 'LDtk',
      doc: 'https://ldtk.io/json',
      schema: 'https://ldtk.io/files/JSON_SCHEMA.json',
      appAuthor: 'Sebastien \'deepnight\' Benard',
      appVersion: '1.5.3',
      url: 'https://ldtk.io',
    },
    iid: makeIid(1),
    jsonVersion: '1.5.3',
    appBuildId: 473703,
    nextUid: UID.levelBase + rooms.length * 100,
    identifierStyle: 'Capitalize',
    toc: [],
    worldLayout: 'LinearHorizontal',
    worldGridWidth: 256,
    worldGridHeight: 256,
    defaultLevelWidth: 960,
    defaultLevelHeight: 544,
    defaultPivotX: 0,
    defaultPivotY: 0,
    defaultGridSize: GRID,
    defaultEntityWidth: 16,
    defaultEntityHeight: 16,
    bgColor: '#40465B',
    defaultLevelBgColor: '#696A79',
    minifyJson: false,
    externalLevels: false,
    exportTiled: false,
    simplifiedExport: false,
    imageExportMode: 'None',
    exportLevelBg: true,
    pngFilePattern: null,
    backupOnSave: false,
    backupLimit: 10,
    backupRelPath: null,
    levelNamePattern: 'Room%idx',
    tutorialDesc: null,
    customCommands: [],
    flags: [],
    defs,
    levels,
    worlds: [],
    dummyWorldIid: makeIid(2),
  } as unknown as LdtkProject;
}

function buildLevel(room: RoomSpec, uid: number, worldX: number, tilesetUid: number): LdtkLevel {
  const cHei = room.rows.length;
  const cWid = room.rows[0]!.length;
  const at = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= cWid || cy >= cHei ? 1 : COLLISION[room.rows[cy]![cx]!] ?? 0);
  const intGridCsv: number[] = [];
  for (let cy = 0; cy < cHei; cy++) for (let cx = 0; cx < cWid; cx++) intGridCsv.push(at(cx, cy));

  // 自動拼貼：依 Collision 選圖塊
  const tile = (cx: number, cy: number, t: number, f = 0): LdtkTile & { d: number[] } => ({
    px: [cx * GRID, cy * GRID],
    src: [(t % 8) * GRID, Math.floor(t / 8) * GRID],
    f,
    t,
    d: [uid, cy * cWid + cx],
    a: 1,
  });
  const terrain: LdtkTile[] = [];
  for (let cy = 0; cy < cHei; cy++) {
    for (let cx = 0; cx < cWid; cx++) {
      const v = at(cx, cy);
      const above = at(cx, cy - 1);
      if (v === 1) {
        const t = above === 3 || above === 4 ? TILE.dirtUnderSlope : above === 1 ? TILE.dirt : TILE.grassTop;
        terrain.push(tile(cx, cy, t));
      } else if (v === 2) terrain.push(tile(cx, cy, TILE.plank));
      else if (v === 3) terrain.push(tile(cx, cy, TILE.slopeUp));
      else if (v === 4) terrain.push(tile(cx, cy, TILE.slopeDown));
      else if (v === 5) terrain.push(tile(cx, cy, TILE.rope));
      else if (v === 6) terrain.push(tile(cx, cy, TILE.ladder));
    }
  }

  let iidSeed = uid * 1000;
  const nextIid = () => makeIid(iidSeed++);
  const layerBase = (identifier: string, type: string, layerDefUid: number, tilesetDefUid: number | null) => ({
    __identifier: identifier,
    __type: type,
    __cWid: cWid,
    __cHei: cHei,
    __gridSize: GRID,
    __opacity: 1,
    __pxTotalOffsetX: 0,
    __pxTotalOffsetY: 0,
    __tilesetDefUid: tilesetDefUid,
    __tilesetRelPath: null,
    iid: nextIid(),
    levelId: uid,
    layerDefUid,
    pxOffsetX: 0,
    pxOffsetY: 0,
    visible: true,
    optionalRules: [],
    intGridCsv: [] as number[],
    autoLayerTiles: [] as LdtkTile[],
    seed: uid,
    overrideTilesetUid: tilesetUid === UID.tilesetBase ? null : tilesetUid,
    gridTiles: [] as LdtkTile[],
    entityInstances: [] as LdtkEntityInstance[],
  });

  // 實體
  const entities: LdtkEntityInstance[] = [];
  const entity = (
    identifier: string,
    defUid: number,
    px: [number, number],
    w: number,
    h: number,
    pivot: [number, number],
    fields: LdtkFieldInstance[],
  ) => {
    entities.push({
      __identifier: identifier,
      __grid: [Math.floor(px[0] / GRID), Math.floor(px[1] / GRID)],
      __pivot: pivot,
      __tags: [],
      __tile: null,
      __smartColor: '#FFFFFF',
      __worldX: worldX + px[0],
      __worldY: px[1],
      iid: nextIid(),
      width: w,
      height: h,
      defUid,
      px,
      fieldInstances: fields,
    } as LdtkEntityInstance);
  };
  // 腳底 = 標記格的底邊中央
  const foot = (cx: number, cy: number): [number, number] => [cx * GRID + GRID / 2, (cy + 1) * GRID];

  for (let cy = 0; cy < cHei; cy++) {
    for (let cx = 0; cx < cWid; cx++) {
      const ch = room.rows[cy]![cx]!;
      if (ch === 'S') entity('PlayerSpawn', UID.entPlayerSpawn, foot(cx, cy), 16, 32, [0.5, 1], []);
      else if (ch === 'N' || ch === 'P' || ch === 'T') {
        const type = ch === 'N' ? 'next' : ch === 'P' ? 'prev' : 'toRoom';
        entity('Portal', UID.entPortal, foot(cx, cy), 32, 48, [0.5, 1], [
          field('type', 'LocalEnum.PortalType', type, UID.fieldPortalType),
          field('toRoom', 'Int', type === 'toRoom' ? (room.toRoom ?? 1) : null, UID.fieldPortalToRoom),
        ]);
      } else if (ch === 'W') {
        entity('WaveEntry', UID.entWaveEntry, foot(cx, cy), 16, 32, [0.5, 1], [
          field('dir', 'Int', cx < cWid / 2 ? 1 : -1, UID.fieldWaveDir),
        ]);
      } else if (ch === 'B' && room.bossMobId) {
        entity('BossSpawn', UID.entBossSpawn, foot(cx, cy), 32, 48, [0.5, 1], [
          field('mobId', 'String', room.bossMobId, UID.fieldBossMob),
          field('intervalSec', 'Float', 300, UID.fieldBossInterval),
        ]);
      }
    }
  }
  for (const z of room.spawnZones) {
    const [cx, cy, cw, ch] = z.rect;
    entity('SpawnZone', UID.entSpawnZone, [cx * GRID, cy * GRID], cw * GRID, ch * GRID, [0, 0], [
      field('maxCount', 'Int', z.maxCount, UID.fieldZoneMax),
      field('respawnSec', 'Float', z.respawnSec, UID.fieldZoneRespawn),
      field('mobs', 'Array<String>', z.mobs, UID.fieldZoneMobs),
    ]);
  }
  for (const l of room.lights) {
    entity('Light', UID.entLight, [l.cx * GRID + GRID / 2, l.cy * GRID + GRID / 2], 16, 16, [0.5, 0.5], [
      field('color', 'Color', l.color, UID.fieldLightColor),
      field('radius', 'Float', l.radius, UID.fieldLightRadius),
      field('intensity', 'Float', l.intensity, UID.fieldLightIntensity),
      field('flicker', 'Float', l.flicker, UID.fieldLightFlicker),
    ]);
  }

  const entitiesLayer = { ...layerBase('Entities', 'Entities', UID.layerEntities, null), overrideTilesetUid: null, entityInstances: entities };
  const decorFront = {
    ...layerBase('DecorFront', 'Tiles', UID.layerDecorFront, tilesetUid),
    gridTiles: room.decorFront.map(([cx, cy, t]) => tile(cx, cy, t)),
  };
  const collision = { ...layerBase('Collision', 'IntGrid', UID.layerCollision, null), overrideTilesetUid: null, intGridCsv };
  const terrainLayer = { ...layerBase('Terrain', 'AutoLayer', UID.layerTerrain, tilesetUid), autoLayerTiles: terrain };
  const decorBack = {
    ...layerBase('DecorBack', 'Tiles', UID.layerDecorBack, tilesetUid),
    gridTiles: room.decorBack.map(([cx, cy, t]) => tile(cx, cy, t)),
  };

  return {
    identifier: `Room${String(room.roomId).padStart(2, '0')}`,
    iid: makeIid(uid),
    uid,
    worldX,
    worldY: 0,
    worldDepth: 0,
    pxWid: cWid * GRID,
    pxHei: cHei * GRID,
    __bgColor: '#696A79',
    bgColor: null,
    useAutoIdentifier: false,
    bgRelPath: null,
    bgPos: null,
    bgPivotX: 0.5,
    bgPivotY: 0.5,
    __smartColor: '#ADADB5',
    __bgPos: null,
    externalRelPath: null,
    fieldInstances: [
      field('roomId', 'Int', room.roomId, UID.fieldRoomId),
      field('theme', 'String', room.theme, UID.fieldTheme),
      field('bgm', 'String', room.bgm, UID.fieldBgm),
    ],
    layerInstances: [entitiesLayer, decorFront, collision, terrainLayer, decorBack] as unknown as LdtkLayerInstance[],
    __neighbours: [],
  } as unknown as LdtkLevel;
}
