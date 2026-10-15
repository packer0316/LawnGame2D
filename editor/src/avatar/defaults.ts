/** 部件登錄的預設值（STUDIO_SPEC §4.4、§4.6）。 */
import { AVATAR_LAYERS, VARIANT_SEPARATOR, VIEW_LAYERS, contentPaths, idCategory } from '@lawn/shared';
import type { AseSheet, AvatarCategory, AvatarItem, AvatarLayer, ClassId } from '@lawn/shared';

export const CATEGORY_LABEL: Record<AvatarCategory, string> = {
  face: '臉型（眼睛）',
  hair: '髮型',
  hat: '帽子',
  top: '上衣',
  bottom: '下衣',
  overall: '套服',
  shoes: '鞋子',
  gloves: '手套',
  cape: '披風',
  weapon: '武器',
  faceAcc: '臉飾',
  eyeAcc: '眼飾',
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as AvatarCategory[];

const ANCHOR_CATEGORIES: AvatarCategory[] = ['face', 'hair', 'hat', 'faceAcc', 'eyeAcc'];

/** 預設換色群組：髮型 → 髮色、臉 → 瞳色、衣物 → 染色。 */
export function defaultRecolor(category: AvatarCategory): AvatarItem['recolor'] {
  if (category === 'hair') return 'hair';
  if (category === 'face') return 'eye';
  if (['hat', 'top', 'bottom', 'overall', 'shoes', 'gloves', 'cape'].includes(category)) return 'dye';
  return undefined;
}

/** sheet 中出現的部件圖層（去掉 @變體、排除範本本體）。 */
export function sheetItemLayers(sheet: AseSheet): AvatarLayer[] {
  const names = new Set(sheet.layers.filter((l): l is string => l !== null).map((l) => l.split(VARIANT_SEPARATOR)[0]!));
  return AVATAR_LAYERS.filter((l) => names.has(l) && l !== 'body' && l !== 'arm_front');
}

/** 依 ID 前綴與 sheet 的圖層猜分類。 */
export function guessCategory(id: string, sheet: AseSheet): AvatarCategory {
  const prefix = idCategory(id);
  if (prefix && (CATEGORIES as string[]).includes(prefix)) return prefix as AvatarCategory;
  const layers = sheetItemLayers(sheet);
  if (layers.includes('weapon')) return 'weapon';
  if (layers.includes('hat')) return 'hat';
  if (layers.includes('hair_front') || layers.includes('hair_back')) return 'hair';
  if (layers.includes('face')) return 'face';
  if (layers.includes('top') && layers.includes('bottom')) return 'overall';
  if (layers.includes('top')) return 'top';
  if (layers.includes('bottom')) return 'bottom';
  return 'top';
}

export function createAvatarItem(id: string, sheet: AseSheet): AvatarItem {
  const category = guessCategory(id, sheet);
  const layers = sheetItemLayers(sheet);
  const recolor = defaultRecolor(category);
  return {
    schemaVersion: 1,
    id,
    name: id,
    category,
    kind: ANCHOR_CATEGORIES.includes(category) ? 'anchor' : 'pose',
    sheet: contentPaths.avatarItemSheet(id),
    layers: layers.length > 0 ? layers : ['top'],
    ...(recolor ? { recolor } : {}),
    ...(category === 'hat' ? { hairMode: 'underHat' as const } : {}),
    ...(category === 'overall' ? { hidesLayers: ['bottom'] as AvatarLayer[] } : {}),
    icon: `avatar/items/${id}.icon.png`,
  };
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

/** 部件需要畫的動作：武器只要通用動作（爬繩梯除外）+ 該職業的攻擊動作（§4.4）。 */
export function requiredTags(item: Pick<AvatarItem, 'category' | 'classId'>, allTags: string[]): string[] {
  if (item.category !== 'weapon') return allTags;
  const own = item.classId ? CLASS_ATTACK_TAGS[item.classId] : ATTACK_TAGS;
  return allTags.filter((t) => !WEAPON_HIDDEN_TAGS.includes(t) && (!ATTACK_TAGS.includes(t) || own.includes(t)));
}

export const isViewLayer = (layer: AvatarLayer) => VIEW_LAYERS.includes(layer);
