import { z } from 'zod';
import { versioned } from '../versioned';
import { HexColorSchema, IdSchema, RangeSchema, RectSchema, Vec2Schema } from './common';

const AnimRefSchema = z.string().min(1);

export const MonsterDefSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: z.string().min(1),
  /** Aseprite 匯出的 JSON（相對 content/）。 */
  sheet: z.string().min(1),
  /** 四個必備動作對應的 Tag 名稱；Boss 可加 appear。 */
  tags: z.object({
    move: AnimRefSchema,
    idle: AnimRefSchema,
    hit: AnimRefSchema,
    die: AnimRefSchema,
    appear: AnimRefSchema.optional(),
  }),
  /** 相對腳底原點。 */
  hitbox: RectSchema,
  labelOffset: Vec2Schema,
  behavior: z.object({
    move: z.enum(['ground', 'fly', 'static']),
    speed: z.number().min(0),
    idleSec: RangeSchema,
    moveSec: RangeSchema,
    knockback: z.number().min(0),
    /** die 動畫播完後淡出的秒數；不填時遊戲用預設 0.4。 */
    dieFadeSec: z.number().min(0).optional(),
  }),
  /** 各幀時間覆寫：key 是時間軸幀號字串，value 是毫秒；沒有覆寫就用 sheet 的 duration。 */
  frameDurations: z.record(z.string().regex(/^\d+$/), z.number().int().positive()).optional(),
  fx: z.object({
    hit: z.string().optional(),
    die: z.string().optional(),
    sfxHit: z.string().optional(),
    sfxDie: z.string().optional(),
    /** die 動畫第幾幀噴金幣。 */
    coinFrame: z.number().int().min(0),
    coinCount: z.number().int().min(0),
    light: z.object({ color: HexColorSchema, radius: z.number().positive() }).optional(),
  }),
  showHpBar: z.boolean(),
  /** 指向數值檔的 MonsterMath.id。 */
  mathId: IdSchema,
});
export type MonsterDef = z.infer<typeof MonsterDefSchema>;
export const MonsterDefFile = versioned(MonsterDefSchema, 1);

export const MonsterTierSchema = z.enum(['normal', 'elite', 'special', 'boss']);
export type MonsterTier = z.infer<typeof MonsterTierSchema>;

/** 正式版只存在伺服器。 */
export const MonsterMathSchema = z.object({
  id: IdSchema,
  tier: MonsterTierSchema,
  /** 固定倍率或區間；最低 2×（SPEC §3.1）。 */
  multiplier: z.union([z.number().min(2), z.tuple([z.number().min(2), z.number().min(2)])]),
  feature: z.enum(['bomb', 'chain', 'drill', 'chest', 'wheel']).optional(),
});
export type MonsterMath = z.infer<typeof MonsterMathSchema>;

/** `content/math/monsters.math.json`。 */
export const MonsterMathFileSchema = z.object({
  schemaVersion: z.literal(1),
  monsters: z.array(MonsterMathSchema),
});
export type MonsterMathFile = z.infer<typeof MonsterMathFileSchema>;
export const MonsterMathFileVersioned = versioned(MonsterMathFileSchema, 1);
