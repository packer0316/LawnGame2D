/** 武器登錄的預設值與規則（STUDIO_SPEC §4，v0.3 起角色不換裝，只換武器）。 */
import { contentPaths } from '@lawn/shared';
import type { AseSheet, AvatarItem, AvatarLayer, ClassId } from '@lawn/shared';

export const CLASS_LABEL: Record<ClassId, string> = { warrior: '劍士', mage: '法師', archer: '弓箭手', assassin: '刺客' };
export const CLASSES = Object.keys(CLASS_LABEL) as ClassId[];

/** 武器可用的圖層。 */
export const WEAPON_LAYERS: AvatarLayer[] = ['weapon', 'weapon_back'];

/** sheet 中出現的武器圖層。 */
export function sheetWeaponLayers(sheet: AseSheet): AvatarLayer[] {
  const names = new Set(sheet.layers.filter((l): l is string => l !== null));
  return WEAPON_LAYERS.filter((l) => names.has(l));
}

/** 各職業的攻擊動作（STUDIO_SPEC §4.2）。 */
export const CLASS_ATTACK_TAGS: Record<ClassId, string[]> = {
  warrior: ['swing1', 'swing2', 'swing3'],
  mage: ['cast'],
  archer: ['shoot'],
  assassin: ['throw'],
};
export const ATTACK_TAGS = Object.values(CLASS_ATTACK_TAGS).flat();

/** 爬繩梯時收起武器（不畫，遊戲端沒有姿勢就隱藏）。 */
export const WEAPON_HIDDEN_TAGS = ['ladder', 'rope'];

/** 依 sheet 畫了哪個職業的攻擊動作猜職業。 */
export function guessClass(sheet: AseSheet): ClassId {
  for (const c of CLASSES) {
    const tags = CLASS_ATTACK_TAGS[c].map((t) => sheet.tags.get(t)).filter((t) => t !== undefined);
    if (tags.some((t) => sheet.frames.some((f) => f.layer === 'weapon' && f.index >= t.from && f.index <= t.to))) return c;
  }
  return 'warrior';
}

export function createWeapon(id: string, sheet: AseSheet): AvatarItem {
  const layers = sheetWeaponLayers(sheet);
  return {
    schemaVersion: 1,
    id,
    name: id,
    category: 'weapon',
    classId: guessClass(sheet),
    kind: 'pose',
    sheet: contentPaths.avatarItemSheet(id),
    layers: layers.length > 0 ? layers : ['weapon'],
    icon: `avatar/items/${id}.icon.png`,
  };
}

/** 武器需要畫的動作：通用動作（爬繩梯除外）+ 自己職業的攻擊動作。 */
export function requiredTags(item: Pick<AvatarItem, 'classId'>, allTags: string[]): string[] {
  const own = item.classId ? CLASS_ATTACK_TAGS[item.classId] : ATTACK_TAGS;
  return allTags.filter((t) => !WEAPON_HIDDEN_TAGS.includes(t) && (!ATTACK_TAGS.includes(t) || own.includes(t)));
}
