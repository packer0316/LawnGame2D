/**
 * 一刀一注的擊殺判定（SPEC §3.1）。
 *
 *   擊殺機率  pᵢ = RTP_base × c × wᵢ / Mᵢ    （c = 技能押注倍數，普攻 1，見 skillCost.ts）
 *   擊殺派彩     = B × Mᵢ
 *   每一刀的期望值 = RTP_base × B × c（= RTP × 實際花費）
 *
 * 倍率最低 2×，所以 pᵢ 永遠 ≤ 0.5。
 */

export const MIN_MULTIPLIER = 2;

/** 基礎返還率（SPEC §3.1）。 */
export const DEFAULT_RTP = 0.96;

/** 一刀砍中 n 隻時，押注分給每隻的權重（加總為 1，第 0 隻是主目標）。 */
export function strikeWeights(n: number, rule: 'even' | 'primary50'): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (rule === 'primary50') return [0.5, ...Array.from({ length: n - 1 }, () => 0.5 / (n - 1))];
  return Array.from({ length: n }, () => 1 / n);
}

export function killProbability(rtp: number, weight: number, multiplier: number, costMul = 1): number {
  return Math.min(1, (rtp * costMul * weight) / Math.max(MIN_MULTIPLIER, multiplier));
}

/** 從倍率設定（固定或區間）抽出這隻怪的實際倍率（整數）。 */
export function rollMultiplier(spec: number | readonly [number, number], random: () => number): number {
  if (typeof spec === 'number') return spec;
  const [min, max] = spec;
  return Math.round(min + (max - min) * random());
}

export interface StrikeTarget {
  uid: number;
  multiplier: number;
}

export interface StrikeOutcome {
  uid: number;
  killed: boolean;
  multiplier: number;
  payout: number;
  probability: number;
}

/** 判定一刀：回傳每隻的結果。random 回傳 [0, 1)。costMul = 這一刀的技能押注倍數（扣 bet × costMul）。 */
export function resolveStrike(
  targets: readonly StrikeTarget[],
  bet: number,
  rtp: number,
  rule: 'even' | 'primary50',
  random: () => number,
  costMul = 1,
): StrikeOutcome[] {
  const weights = strikeWeights(targets.length, rule);
  return targets.map((target, i) => {
    const probability = killProbability(rtp, weights[i]!, target.multiplier, costMul);
    const killed = random() < probability;
    return { uid: target.uid, killed, multiplier: target.multiplier, payout: killed ? bet * target.multiplier : 0, probability };
  });
}

/** 可重現的亂數（mulberry32），給確定性 AI 與測試用。正式版判定用 CSPRNG。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
