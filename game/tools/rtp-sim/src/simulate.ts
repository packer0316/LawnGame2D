import { resolveStrike, rollMultiplier, seededRandom, type MonsterMath, type SkillDef } from '@lawn/shared';

/**
 * 模擬大量「一刀」並統計返還率（SPEC §3.1）。
 * 每一刀：依技能抽一刀的設定 → 依生怪比例抽出命中幾隻、各是哪種怪 → 用 resolveStrike 判定。
 */
export interface SimulationInput {
  strikes: number;
  rtp: number;
  bet: number;
  seed: number;
  /** 怪物數值（倍率） */
  monsters: MonsterMath[];
  /** 怪物出現權重（例如所有生怪區的 pool 權重加總）；缺少時平均 */
  spawnWeights?: Record<string, number>;
  /** 用到的技能；每刀平均抽一個技能、再抽其中一刀 */
  skills: SkillDef[];
}

export interface SimulationResult {
  strikes: number;
  spent: number;
  paid: number;
  rtp: number;
  /** 返還率的標準誤 */
  standardError: number;
  kills: number;
  maxPayoutMultiple: number;
  /** 依命中隻數分組的返還率 */
  byTargets: Record<number, { strikes: number; rtp: number }>;
}

export function simulate(input: SimulationInput): SimulationResult {
  const random = seededRandom(input.seed);
  const pool = input.monsters.map((m) => ({ math: m, weight: input.spawnWeights?.[m.id] ?? 1 }));
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  const pickMonster = () => {
    let r = random() * totalWeight;
    for (const p of pool) if ((r -= p.weight) < 0) return p.math;
    return pool.at(-1)!.math;
  };
  const strikes = input.skills.flatMap((skill) => skill.strikes);

  let spent = 0;
  let paid = 0;
  let sumSquares = 0;
  let kills = 0;
  let maxPayoutMultiple = 0;
  const byTargets = new Map<number, { strikes: number; spent: number; paid: number }>();

  for (let i = 0; i < input.strikes; i += 1) {
    const strike = strikes[Math.floor(random() * strikes.length)]!;
    // 命中隻數：1 到 maxTargets，群攻偏向打到多隻
    const count = 1 + Math.floor(random() * strike.maxTargets);
    const targets = Array.from({ length: count }, (_, uid) => ({ uid, multiplier: rollMultiplier(pickMonster().multiplier, random) }));
    const outcomes = resolveStrike(targets, input.bet, input.rtp, strike.weightRule, random);
    const payout = outcomes.reduce((sum, o) => sum + o.payout, 0);
    spent += input.bet;
    paid += payout;
    sumSquares += (payout / input.bet) ** 2;
    kills += outcomes.filter((o) => o.killed).length;
    maxPayoutMultiple = Math.max(maxPayoutMultiple, payout / input.bet);
    const group = byTargets.get(count) ?? { strikes: 0, spent: 0, paid: 0 };
    group.strikes += 1;
    group.spent += input.bet;
    group.paid += payout;
    byTargets.set(count, group);
  }

  const mean = paid / spent;
  const variance = sumSquares / input.strikes - mean * mean;
  return {
    strikes: input.strikes,
    spent,
    paid,
    rtp: mean,
    standardError: Math.sqrt(Math.max(0, variance) / input.strikes),
    kills,
    maxPayoutMultiple,
    byTargets: Object.fromEntries([...byTargets].sort((a, b) => a[0] - b[0]).map(([n, g]) => [n, { strikes: g.strikes, rtp: g.paid / g.spent }])),
  };
}
