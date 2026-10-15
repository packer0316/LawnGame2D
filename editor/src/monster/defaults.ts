import { contentPaths } from '@lawn/shared';
import type { AseSheet, MonsterDef, MonsterMath } from '@lawn/shared';
import { guessTag, hitboxFromSlice, labelFromSlice, tagBounds } from './sheet';

/** 新登錄的怪物：Tag 自動對應、判定框與標籤位置取 Slice（沒有時用 idle 的實際範圍）。 */
export function createMonsterDef(id: string, sheet: AseSheet): MonsterDef {
  const idleTag = sheet.tags.get(guessTag(sheet, 'idle') ?? '') ?? [...sheet.tags.values()][0];
  const bounds = idleTag ? tagBounds(sheet, idleTag) : undefined;
  const hitbox = hitboxFromSlice(sheet) ?? bounds ?? { x: -12, y: -24, w: 24, h: 24 };
  const label = labelFromSlice(sheet) ?? { x: 0, y: hitbox.y - 6 };
  const appear = guessTag(sheet, 'appear');
  return {
    schemaVersion: 1,
    id,
    name: id,
    sheet: contentPaths.monsterSheet(id),
    tags: {
      move: guessTag(sheet, 'move') ?? '',
      idle: guessTag(sheet, 'idle') ?? '',
      hit: guessTag(sheet, 'hit') ?? '',
      die: guessTag(sheet, 'die') ?? '',
      ...(appear ? { appear } : {}),
    },
    hitbox,
    labelOffset: label,
    behavior: { move: 'ground', speed: 30, idleSec: [1, 3], moveSec: [2, 5], knockback: 8 },
    fx: { hit: 'hit_spark', die: 'explosion', coinFrame: 2, coinCount: 2 },
    showHpBar: false,
    mathId: id,
  };
}

export function createMonsterMath(id: string): MonsterMath {
  return { id, tier: 'normal', multiplier: 2 };
}

/** SPEC §3.8 的等級倍率範圍與 STUDIO_SPEC §5.1 的尺寸範圍。 */
export const TIER_RULES = {
  normal: { multiplier: [2, 20], height: [24, 48] },
  elite: { multiplier: [30, 80], height: [64, 96] },
  special: { multiplier: [2, 500], height: [24, 96] },
  boss: { multiplier: [100, 500], height: [128, 192] },
} as const;
