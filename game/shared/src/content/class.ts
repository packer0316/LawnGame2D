import { z } from 'zod';
import { versioned } from '../versioned';
import { ClassIdSchema, IdSchema, RangeSchema } from './common';

/**
 * 職業、技能、押注等級（SPEC §3.2、§3.3、§7）。`content/class/` 由遊戲手寫（COLLAB §1）。
 */

export const AreaSchema = z.object({
  /** rect：前方矩形；circle：自身周圍；sector：前方扇形；line：前方直線；screen：整個畫面 */
  shape: z.enum(['rect', 'circle', 'sector', 'line', 'screen']),
  /** 長度（rect、line 的前方距離） */
  w: z.number().min(0).optional(),
  /** 高度（rect、line 的上下範圍） */
  h: z.number().min(0).optional(),
  /** 半徑（circle、sector） */
  r: z.number().min(0).optional(),
  /** 範圍起點離身體多遠（往前為正） */
  offsetX: z.number().optional(),
});
export type Area = z.infer<typeof AreaSchema>;

export const StrikeSchema = z.object({
  /** 動作開始後第幾毫秒判定 */
  atMs: z.number().min(0),
  area: AreaSchema,
  maxTargets: z.number().int().positive(),
  /** false = 只打最近的第一隻 */
  pierce: z.boolean(),
  weightRule: z.enum(['even', 'primary50']),
});
export type Strike = z.infer<typeof StrikeSchema>;

export const SkillDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  classId: ClassIdSchema,
  kind: z.enum(['basic', 'active']),
  /** 角色動作 Tag，例如 swing1、cast */
  pose: z.string().min(1),
  /** 每一刀 = 一次判定 = 命中時扣一注 */
  strikes: z.array(StrikeSchema).min(1),
  cooldownSec: z.number().min(0),
  /** 動作開始多久後可被翻滾、跳躍或下一段連擊取消 */
  cancelFromMs: z.number().min(0),
  /** 連擊：在可取消時按攻擊，接到這個技能 */
  comboNext: IdSchema.optional(),
  /** 判定期間往前的推進速度（px/s） */
  lunge: z.number().optional(),
  /** 投射物：命中時才扣款（SPEC §3.1） */
  projectile: z.object({ fx: z.string(), speed: z.number().positive() }).optional(),
  /** 瞬移到最近目標背後（刺客影襲） */
  blink: z.boolean().optional(),
  hitStopMs: z.number().min(0),
  shake: z.number().min(0),
  fx: z.string().optional(),
  slashFx: z.string().optional(),
  sound: z.string().optional(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

export const ClassDefSchema = z.object({
  id: ClassIdSchema,
  name: z.string().min(1),
  /** 普攻（連擊的第一段） */
  basic: IdSchema,
  /** 技能 1、技能 2 */
  skills: z.tuple([IdSchema, IdSchema]),
  /** 預設武器部件 */
  weapon: IdSchema,
  /** 空中可再跳幾次（刺客 = 1） */
  maxAirJumps: z.number().int().min(0),
  /** 傷害數字的演出區間（純演出） */
  damage: RangeSchema,
});
export type ClassDef = z.infer<typeof ClassDefSchema>;

export const ClassFileSchema = z.object({ schemaVersion: z.literal(1), classes: z.array(ClassDefSchema) });
export type ClassFile = z.infer<typeof ClassFileSchema>;
export const ClassFileVersioned = versioned(ClassFileSchema, 1);

export const SkillFileSchema = z.object({ schemaVersion: z.literal(1), skills: z.array(SkillDefSchema) });
export type SkillFile = z.infer<typeof SkillFileSchema>;
export const SkillFileVersioned = versioned(SkillFileSchema, 1);

export const BetLevelSchema = z.object({
  bet: z.number().positive(),
  /** 押注等級外觀 1–5（SPEC §3.2） */
  visualTier: z.number().int().min(1).max(5),
});
export type BetLevel = z.infer<typeof BetLevelSchema>;

export const BetLevelFileSchema = z.object({ schemaVersion: z.literal(1), levels: z.array(BetLevelSchema).min(1) });
export type BetLevelFile = z.infer<typeof BetLevelFileSchema>;
export const BetLevelFileVersioned = versioned(BetLevelFileSchema, 1);
