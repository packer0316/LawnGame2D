import { z } from 'zod';
import { versioned } from '../versioned';
import { ClassIdSchema, IdSchema, RangeSchema } from './common';

/**
 * 職業、技能、押注等級（SPEC §3.2、§3.3、§7）。`content/class/` 由遊戲手寫（COLLAB §1）。
 */

export const AreaSchema = z.object({
  /**
   * rect：前方矩形；circle：自身周圍；sector：前方扇形；line：前方直線；screen：整個畫面；
   * path：技能開始時的位置到現在位置（衝刺、瞬移掃過的路線），再往前延伸 w；map：整張地圖（大絕招）
   */
  shape: z.enum(['rect', 'circle', 'sector', 'line', 'screen', 'path', 'map']),
  /** 長度（rect、line 的前方距離；path 往前延伸的距離） */
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
  /** 這一刀的程式特效（engine/src/feel/SkillFx.ts），例如 lightning、quake、nova */
  fx: z.string().optional(),
});
export type Strike = z.infer<typeof StrikeSchema>;

/**
 * 技能位移（SPEC §3.3）。atMs 是動作開始後第幾毫秒發動。
 * - dash：貼地衝刺 distance 像素（負數 = 往後），花 durationMs
 * - leap：跳起來，vy 往上的速度、vx 空中的水平速度（負數 = 往後）
 * - blink：瞬間移到前方 distance 像素（被牆擋住或前方沒地面就縮短）
 * - tierLeap：看左右 range、往上 rise／往下 fall 以內哪個足場怪最多，算好拋物線跳過去（往下會穿過腳下的單向平台）；
 *   沒有比現在這層更好的地方就原地往上跳
 * - tierBlink：同上，但直接瞬移到那個足場的怪群中間；沒有更好的地方就往前瞬移 distance
 * tierLeap／tierBlink 讓角色在樓層之間移動（自動冒險時不會一直停在同一層，SPEC §3.6）。
 */
export const SkillMoveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dash'), atMs: z.number().min(0), distance: z.number(), durationMs: z.number().positive() }),
  z.object({ kind: z.literal('leap'), atMs: z.number().min(0), vx: z.number(), vy: z.number().positive() }),
  z.object({ kind: z.literal('blink'), atMs: z.number().min(0), distance: z.number().positive() }),
  z.object({ kind: z.literal('tierLeap'), atMs: z.number().min(0), range: z.number().positive(), rise: z.number().positive(), fall: z.number().positive() }),
  z.object({ kind: z.literal('tierBlink'), atMs: z.number().min(0), range: z.number().positive(), rise: z.number().positive(), fall: z.number().positive(), distance: z.number().positive() }),
]);
export type SkillMove = z.infer<typeof SkillMoveSchema>;

/** 不判定的演出時點（例如隕石開始落下、迴旋刃飛出）。 */
export const SkillCueSchema = z.object({ atMs: z.number().min(0), fx: z.string() });
export type SkillCue = z.infer<typeof SkillCueSchema>;

export const SkillDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  classId: ClassIdSchema,
  kind: z.enum(['basic', 'active']),
  /** 角色動作 Tag，例如 swing1、cast（沒有 motion 或缺少整體動畫時使用） */
  pose: z.string().min(1),
  /**
   * 整體動畫（人物 + 武器合圖，例如 Codex 的森境旅人技能動作）：播放時取代紙娃娃。
   * speed 是播放倍率；loop = 技能期間重複播放（連射、連斬）。
   */
  motion: z.object({ tag: z.string().min(1), speed: z.number().positive().optional(), loop: z.boolean().optional() }).optional(),
  /** 技能列的圖示名稱（HUD） */
  icon: z.string().optional(),
  /** 每一刀 = 一次判定 = 命中時扣一注 */
  strikes: z.array(StrikeSchema).min(1),
  cooldownSec: z.number().min(0),
  /** 動作開始多久後可被翻滾、跳躍或下一段連擊取消 */
  cancelFromMs: z.number().min(0),
  /** 連擊：在可取消時按攻擊，接到這個技能 */
  comboNext: IdSchema.optional(),
  /** 判定期間往前的推進速度（px/s） */
  lunge: z.number().optional(),
  /**
   * 投射物：命中時才扣款（SPEC §3.1）。explode = 命中時對半徑內的怪一起判定。
   * aim = 出手時在面向 ±coneDeg、range 內找目標並朝它飛；turnDegPerSec > 0 時飛行中持續追蹤（每秒最多轉幾度）
   */
  projectile: z
    .object({
      fx: z.string(),
      speed: z.number().positive(),
      explode: z.number().positive().optional(),
      tint: z.number().int().optional(),
      scale: z.number().positive().optional(),
      aim: z.object({ coneDeg: z.number().min(0).max(90), range: z.number().positive(), turnDegPerSec: z.number().min(0) }).optional(),
    })
    .optional(),
  /** 瞬移到最近目標背後（刺客影襲） */
  blink: z.boolean().optional(),
  move: SkillMoveSchema.optional(),
  cues: z.array(SkillCueSchema).optional(),
  /**
   * 連鎖：第一刀照 area 找目標，之後每一刀找離上一個目標 range 內、還沒打過的最近一隻。
   * blink = 每一刀瞬移到目標背後（刺客影襲）
   * verticalWeight = 算距離時高低差乘上這個值（< 1 = 比較常跳到上下層的怪，預設 1）
   */
  chain: z.object({ range: z.number().positive(), blink: z.boolean().optional(), verticalWeight: z.number().positive().optional() }).optional(),
  /**
   * 散射（分身飛鏢、影分身）：第一刀時在畫面內挑 count 個點（優先是怪物、彼此分開），
   * 之後每一刀打這些點 radius 內的怪
   */
  scatter: z.object({ count: z.number().int().positive(), radius: z.number().positive() }).optional(),
  /** 大絕招：HUD 金框 */
  ultimate: z.boolean().optional(),
  /**
   * 技能押注倍數（SPEC §3.1）：放一次、每一刀都打滿時共扣 押注 × price（1–20，普攻 1）。
   * fullTargets = 每一刀打到幾隻才算滿價，打得少按比例少扣。數值由 tools/rtp-sim 的 prices 計算。
   */
  price: z.number().min(1).max(20).optional(),
  fullTargets: z.number().int().min(1).optional(),
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
  /** 技能列（HUD 上排，鍵盤 1–8）。開發模式固定放這些；實際模式靠打怪掉落（不含 secondary） */
  skills: z.array(IdSchema).min(1).max(8),
  /** 常駐小技能（鍵盤 X）：實際模式除了普攻之外唯一一直能用的技能，不會掉落 */
  secondary: IdSchema.optional(),
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
