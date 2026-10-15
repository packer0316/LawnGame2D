import type { Area, SkillDef } from '../content/class';
import { MIN_MULTIPLIER, strikeWeights, type StrikeTarget } from './rtp';

/**
 * 技能價格（SPEC §3.1「技能押注倍數」）。
 *
 * - 每個技能有價格 N（1–20）：放一次、每一刀都打滿時，總共扣 押注 B × N。N 平均分給每一刀。
 * - 一刀實際扣 B × c，c = (N ÷ 刀數) × min(1, 打中隻數 ÷ 滿價隻數)：打得少就按比例少扣，
 *   打得比滿價隻數多也不多收；揮空不扣。
 * - 錢拿去提高擊殺率、派彩倍率不變：pᵢ = RTP × c × wᵢ ÷ Mᵢ，派彩 B × Mᵢ，
 *   所以每一刀的期望值永遠是 RTP × 實際花費，任何技能 RTP 都一樣。
 * - c 會壓到「每隻的擊殺機率 ≤ 1」，超過的部分不收錢（不然多花的錢拿不回來）。
 */

export const MAX_SKILL_PRICE = 20;
/** 價格公式的折扣指數：N ≈ 預期打中隻次^0.7。打得越多、每隻次越便宜（大技能的 CP 值）。 */
export const PRICE_EXPONENT = 0.7;

/** 估算命中數用的怪物密度（SPEC §3.1）：可站立的長度上平均每像素幾隻怪、一層樓高幾像素、整房幾隻。 */
export interface DensityModel {
  perPixel: number;
  tierHeight: number;
  tiers: number;
  roomTotal: number;
}

export const DEFAULT_DENSITY: DensityModel = { perPixel: 0.009, tierHeight: 128, tiers: 3, roomTotal: 30 };

/** 一刀在一般密度下預期打中幾隻（至少 1：有怪才會出手）。 */
export function expectedTargets(skill: SkillDef, area: Area, maxTargets: number, density: DensityModel = DEFAULT_DENSITY): number {
  const tiersCovered = (height: number) => Math.min(density.tiers, Math.max(1, Math.round(height / density.tierHeight)));
  let count: number;
  if (skill.projectile && !skill.projectile.explode) count = 1;
  else if (skill.chain) count = 1;
  else if (skill.scatter) count = skill.scatter.count * Math.max(1, density.perPixel * skill.scatter.radius * 2);
  else if (skill.projectile?.explode) count = 1 + density.perPixel * skill.projectile.explode * 2;
  else {
    switch (area.shape) {
      case 'rect':
      case 'line':
        count = density.perPixel * (area.w ?? 0) * tiersCovered(area.h ?? 24);
        break;
      case 'path': {
        const move = skill.move;
        const travel = move?.kind === 'dash' ? Math.abs(move.distance) : move?.kind === 'blink' || move?.kind === 'tierBlink' ? move.distance : 0;
        count = density.perPixel * (travel + (area.w ?? 0)) * tiersCovered(area.h ?? 60);
        break;
      }
      case 'circle':
        count = density.perPixel * (area.r ?? 0) * 2 * tiersCovered((area.r ?? 0) * 2);
        break;
      case 'sector':
        count = density.perPixel * (area.r ?? 0) * tiersCovered((area.r ?? 0) * 2);
        break;
      case 'screen':
      case 'map':
        count = density.roomTotal;
        break;
    }
  }
  return Math.max(1, Math.min(maxTargets, count));
}

/** 放一次技能預期打中幾隻次（每一刀加總）。 */
export function expectedHits(skill: SkillDef, density: DensityModel = DEFAULT_DENSITY): number {
  return skill.strikes.reduce((sum, strike) => sum + expectedTargets(skill, strike.area, strike.maxTargets, density), 0);
}

/** 建議價格：預期打中隻次^0.7，四捨五入、1–20；大絕招固定最高價。 */
export function suggestPrice(skill: SkillDef, density: DensityModel = DEFAULT_DENSITY): number {
  if (skill.kind === 'basic') return 1;
  if (skill.ultimate) return MAX_SKILL_PRICE;
  return Math.max(1, Math.min(MAX_SKILL_PRICE, Math.round(expectedHits(skill, density) ** PRICE_EXPONENT)));
}

/** 建議的滿價隻數（每一刀）：一般密度下預期打中的隻數，四捨五入、至少 1。 */
export function suggestFullTargets(skill: SkillDef, density: DensityModel = DEFAULT_DENSITY): number {
  const perStrike = skill.strikes.map((s) => expectedTargets(skill, s.area, s.maxTargets, density));
  return Math.max(1, Math.round(perStrike.reduce((a, b) => a + b, 0) / perStrike.length));
}

/**
 * 這一刀實際的押注倍數 c（扣 B × c）。flat = 開發模式：所有技能一刀都只算 1 倍。
 * 會壓到每隻的擊殺機率不超過 1。
 */
export function strikeCostMultiplier(
  skill: Pick<SkillDef, 'price' | 'fullTargets' | 'strikes'>,
  strikeIndex: number,
  targets: readonly StrikeTarget[],
  rtp: number,
  options: { flat?: boolean } = {},
): number {
  if (targets.length === 0) return 0;
  const strike = skill.strikes[strikeIndex];
  if (!strike) return 0;
  const full = Math.max(1, skill.fullTargets ?? 1);
  let c = options.flat ? 1 : ((skill.price ?? 1) / skill.strikes.length) * Math.min(1, targets.length / full);
  // 每隻的擊殺機率 = RTP × c × wᵢ ÷ Mᵢ ≤ 1
  const weights = strikeWeights(targets.length, strike.weightRule);
  for (const [i, target] of targets.entries()) {
    const limit = Math.max(MIN_MULTIPLIER, target.multiplier) / (rtp * weights[i]!);
    c = Math.min(c, limit);
  }
  // 取到 0.01（無條件捨去：機率不會超過 1，扣款與判定用同一個值，期望值精確等於 RTP × 花費）
  return Math.floor(c * 100) / 100;
}
