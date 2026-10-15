import type { ClassId } from '@lawn/shared';

export type WeaponKind = 'sword' | 'staff' | 'bow' | 'claw';
export type ScrollRate = 10 | 60 | 90;
export interface WeaponDefinition { id: string; kind: WeaponKind; classId: ClassId; name: string; description: string; frame: number }
export const WEAPON_KINDS: Record<WeaponKind, { name: string; classId: ClassId }> = {
  sword: { name: '劍', classId: 'warrior' }, staff: { name: '法杖', classId: 'mage' },
  bow: { name: '弓', classId: 'archer' }, claw: { name: '拳刃', classId: 'assassin' },
};
const names: Record<WeaponKind, string[]> = {
  sword: ['旅人鐵劍', '翠葉誓約', '銀月弧光', '熔心焰鋒', '滄潮流刃', '霜晶長劍', '紫霆符劍', '曦日聖劍', '幽淵裂刃', '玉龍御劍'],
  staff: ['橡木旅杖', '森靈枝語', '月輪祈願', '熔核火杖', '潮汐海螺', '霜冠晶杖', '雷晶導杖', '日輪權杖', '虛空星核', '玉龍靈杖'],
  bow: ['林野獵弓', '翠羽長弓', '銀月弦歌', '熔火曲弓', '滄浪潮弓', '冰晶霜弦', '紫電追星', '曜金天弓', '幽夜裂空', '玉龍盤弓'],
  claw: ['旅者鐵拳刃', '翠葉雙牙', '月牙拳刃', '熔岩赤爪', '潮影雙鋒', '霜晶冰爪', '紫霆拳刃', '曦日金爪', '幽淵影牙', '玉龍拳牙'],
};
const themes = ['舊鐵與皮革，陪伴旅人的第一把武器。', '翠綠葉脈與精靈雕紋，輕盈而自然。', '銀色月弧與冷光寶石，寧靜的夜行裝束。', '黑曜火山紋與紅寶石，凝住熔火的瞬間。', '青綠潮紋與海洋曲線，帶著海風的輪廓。', '淡藍晶簇與霜銀，清透而銳利。', '紫晶與雷紋金屬，醒目的雷霆配色。', '古金與白玉，晨曦般莊嚴的儀式武器。', '靛黑輪廓與紫色核心，深夜星空的神祕感。', '青玉、龍紋與古金，東方幻想的珍藏款。'];
export const WEAPONS: WeaponDefinition[] = (Object.keys(names) as WeaponKind[]).flatMap((kind) => names[kind].map((name, frame) => ({ id: `${kind}-${frame + 1}`, kind, classId: WEAPON_KINDS[kind].classId, name, description: themes[frame]!, frame })));
export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
export const UPGRADE_SLOTS = 7;
export const BASE_SELL_VALUE = 1000;
export const BAG_CAPACITY = 120;
export const SCROLL_RATES: ScrollRate[] = [10, 60, 90];
/** DEMO 經濟參數。breakOnFailure 是「已失敗後」的條件機率。 */
export const SCROLL_RULES = {
  10: { success: .1, breakOnFailure: .2, bonus: 5000, price: 600 },
  60: { success: .6, breakOnFailure: .1, bonus: 1000, price: 600 },
  90: { success: .9, breakOnFailure: .05, bonus: 300, price: 300 },
} as const;
export const DROP_RULES = { weapon: .04, scroll: .12 } as const;
