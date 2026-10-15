import { z } from 'zod';
import { versioned } from '../versioned';
import { IdSchema, RangeSchema, WeightedMobSchema } from './common';

export const RoomDefSchema = z.object({
  /** 1–20 */
  id: z.number().int().min(1),
  mapId: IdSchema,
  name: z.string().min(1),
  /** 該房可用的押注範圍 [最低, 最高]。 */
  betRange: z.tuple([z.number().positive(), z.number().positive()]),
  /** 換房列表顯示的怪物圖示（實際生怪依地圖的生怪區）。 */
  lineup: z.array(IdSchema).optional(),
  boss: z.object({ mobId: IdSchema, intervalSec: z.number().positive() }).optional(),
  wave: z
    .object({
      everySec: RangeSchema,
      durationSec: z.number().positive(),
      pool: z.array(WeightedMobSchema).min(1),
      maxMonsters: z.number().int().positive(),
    })
    .optional(),
  /** 覆蓋地圖的 BGM。 */
  bgm: z.string().optional(),
});
export type RoomDef = z.infer<typeof RoomDefSchema>;

/** `content/rooms/rooms.json`。 */
export const RoomFileSchema = z.object({
  schemaVersion: z.literal(1),
  rooms: z.array(RoomDefSchema),
});
export type RoomFile = z.infer<typeof RoomFileSchema>;
export const RoomFileVersioned = versioned(RoomFileSchema, 1);
