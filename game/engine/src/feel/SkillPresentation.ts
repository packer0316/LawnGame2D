import type { SkillDef } from '@lawn/shared';

export const CLASS_ENERGY = {
  warrior: { color: 0x7cdbff, core: 0xf5fcff, shadow: 0x162b45 },
  mage: { color: 0xb58aff, core: 0xf3eaff, shadow: 0x231132 },
  archer: { color: 0xffcc62, core: 0xfff5cc, shadow: 0x392917 },
  assassin: { color: 0xff4567, core: 0xffd6e1, shadow: 0x2e0d1b },
} as const;

export function skillEnergyColor(skill:SkillDef):number {
  return skill.id==='skill_0032'?0x8bdfff:skill.id==='skill_0035'?0x8dffb6:skill.id==='skill_0034'?0xc7a0ff:skill.id==='skill_0046'?0xffd481:CLASS_ENERGY[skill.classId].color;
}

/** 表現層節奏：不改判定、傷害或扣注時間；連段保留流動感，末段才有重停頓。 */
export function impactFeel(skill: SkillDef, index: number) {
  const last = index === skill.strikes.length - 1;
  const repeated = skill.strikes.length > 1;
  const fast = skill.chain || (skill.strikes[index + 1]?.atMs ?? Infinity) - skill.strikes[index]!.atMs <= 100;
  const heavy = skill.id === 'skill_0006' || skill.id === 'skill_0007';
  const stop = repeated && !last ? Math.min(skill.hitStopMs, heavy ? 48 : fast ? 10 : 22) : Math.min(skill.ultimate ? 105 : 115, skill.hitStopMs + (skill.ultimate && last ? 35 : 0));
  return {
    stopMs: stop,
    pixels: Math.min(7, skill.shake * (repeated && !last ? 0.45 : skill.ultimate ? 1.25 : 1)),
    durationMs: heavy ? 160 : last && skill.ultimate ? 180 : repeated && !last ? 65 : 110,
    strength: heavy ? (last ? 1.5 : 1.1) : skill.ultimate ? (last ? 1.65 : 0.85) : skill.kind === 'basic' ? 0.45 : repeated && !last ? 0.65 : 1,
    last,
  };
}

/** 渲染預算獨立於敵人數／傷害判定；大範圍招式仍會命中全部合法目標。 */
export const VFX_BUDGET = { particles: 220, targets: 18, ornaments: 380, lights: 12 } as const;
