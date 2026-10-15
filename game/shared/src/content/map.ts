import { z } from 'zod';
import { versioned } from '../versioned';
import { HexColorSchema, IdSchema, RectSchema, WeightedMobSchema } from './common';

const PointSchema = z.tuple([z.number(), z.number()]);

/** 可站立的地面：只含水平與 45° 線段，points 的 x 由左到右嚴格遞增；相連的地面合成同一條折線。 */
export const FootholdSchema = z
  .object({
    id: z.number().int(),
    points: z.array(PointSchema).min(2),
    /** 單向平台：可從下方跳上、↓ + 跳穿下。 */
    oneWay: z.boolean(),
  })
  .refine((foothold) => foothold.points.every((point, i, all) => i === 0 || point[0] > all[i - 1]![0]), {
    message: '足場頂點的 x 必須由左到右嚴格遞增',
    path: ['points'],
  });
export type Foothold = z.infer<typeof FootholdSchema>;

/** 實地與斜坡的實心側面。side = 實心在牆的哪一側（-1 左、1 右）：side = 1 擋住往右走。 */
export const WallSchema = z.object({
  id: z.number().int(),
  x: z.number(),
  yTop: z.number(),
  yBottom: z.number(),
  side: z.union([z.literal(-1), z.literal(1)]),
});
export type Wall = z.infer<typeof WallSchema>;

/** 實地與斜坡的底面，跳上來會撞頭（單向平台沒有天花板）。 */
export const CeilingSchema = z.object({
  id: z.number().int(),
  y: z.number(),
  x1: z.number(),
  x2: z.number(),
});
export type Ceiling = z.infer<typeof CeilingSchema>;

export const ClimbableSchema = z.object({
  id: z.number().int(),
  type: z.enum(['ladder', 'rope']),
  x: z.number(),
  yTop: z.number(),
  yBottom: z.number(),
});
export type Climbable = z.infer<typeof ClimbableSchema>;

export const PortalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['spawn', 'next', 'prev', 'toRoom']),
  x: z.number(),
  y: z.number(),
  toRoom: z.number().int().min(1).optional(),
});
export type Portal = z.infer<typeof PortalSchema>;

export const SpawnZoneSchema = z.object({
  id: z.string().min(1),
  rect: RectSchema,
  footholdIds: z.array(z.number().int()),
  maxCount: z.number().int().min(0),
  respawnSec: z.number().min(0),
  pool: z.array(WeightedMobSchema).min(1),
});
export type SpawnZone = z.infer<typeof SpawnZoneSchema>;

export const MapLightSchema = z.object({
  x: z.number(),
  y: z.number(),
  color: HexColorSchema,
  radius: z.number().positive(),
  intensity: z.number().min(0),
  /** 0 = 不閃爍。 */
  flicker: z.number().min(0),
});
export type MapLight = z.infer<typeof MapLightSchema>;

export const NavEdgeTypeSchema = z.enum(['run', 'jump', 'drop', 'climb', 'roll', 'portal']);
export type NavEdgeType = z.infer<typeof NavEdgeTypeSchema>;

export const NavGraphSchema = z.object({
  nodes: z.array(z.object({ id: z.number().int(), footholdIds: z.array(z.number().int()) })),
  edges: z.array(
    z.object({
      from: z.number().int(),
      to: z.number().int(),
      type: NavEdgeTypeSchema,
      /** 起跳／下跳／抓繩梯的 x（在 from 足場上）；buildNavGraph 會填 */
      x: z.number().optional(),
      /** 起跳時按的方向（-1 左、0 原地、1 右） */
      dir: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    }),
  ),
});
export type NavGraph = z.infer<typeof NavGraphSchema>;

export const TileLayerSchema = z.object({
  name: z.string(),
  /** content/ 相對路徑，例：tilesets/forest.png */
  tileset: z.string(),
  z: z.enum(['back', 'front']),
  /** [x, y, tileId, flip]：x／y 為圖塊左上角像素；flip 的 bit0 = 水平、bit1 = 垂直（同 LDtk）。 */
  tiles: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
});

export const TILE_FLIP_X = 1;
export const TILE_FLIP_Y = 2;

export const MapDefSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1),
  /** → ThemeDef.id（theme_0001 …） */
  theme: IdSchema,
  bgm: z.string(),
  tileSize: z.literal(16),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  cameraBounds: RectSchema,
  tileLayers: z.array(TileLayerSchema),
  decors: z.array(
    z.object({
      tileset: z.string(),
      tileId: z.number().int(),
      x: z.number(),
      y: z.number(),
      z: z.enum(['back', 'front']),
      flipX: z.boolean(),
    }),
  ),
  lights: z.array(MapLightSchema),
  footholds: z.array(FootholdSchema),
  walls: z.array(WallSchema),
  ceilings: z.array(CeilingSchema),
  /** x：格子中心；yTop／yBottom：連續格子的上緣／下緣。 */
  climbables: z.array(ClimbableSchema),
  portals: z.array(PortalSchema),
  spawnZones: z.array(SpawnZoneSchema),
  waveEntries: z.array(z.object({ x: z.number(), y: z.number(), dir: z.union([z.literal(1), z.literal(-1)]) })),
  boss: z
    .object({ mobId: IdSchema, x: z.number(), y: z.number(), intervalSec: z.number().positive() })
    .optional(),
  nav: NavGraphSchema,
});
export type MapDef = z.infer<typeof MapDefSchema>;
export const MapDefFile = versioned(MapDefSchema, 1);

export const ThemeDefSchema = z.object({
  /** theme_0001 …（遵守 ID 規則） */
  id: IdSchema,
  ambient: z.object({ color: HexColorSchema, intensity: z.number().min(0) }),
  tileset: z.object({ image: z.string(), normal: z.string().optional() }),
  backgrounds: z.array(
    z.object({
      image: z.string(),
      normal: z.string().optional(),
      rx: z.number(),
      ry: z.number(),
      tileX: z.boolean(),
      tileY: z.boolean(),
      scrollX: z.number().optional(),
      y: z.number(),
    }),
  ),
});
export type ThemeDef = z.infer<typeof ThemeDefSchema>;

/** `content/themes/themes.json`。 */
export const ThemeFileSchema = z.object({
  schemaVersion: z.literal(1),
  themes: z.array(ThemeDefSchema),
});
export type ThemeFile = z.infer<typeof ThemeFileSchema>;
export const ThemeFileVersioned = versioned(ThemeFileSchema, 1);
