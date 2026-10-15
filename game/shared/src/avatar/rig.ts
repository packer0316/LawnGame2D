import type { AseSheet, AseTag } from '../aseprite';
import { AVATAR_TAGS, type AvatarLayer, type AvatarSlice, type AvatarTag } from '../content/avatar';

/**
 * 紙娃娃的組裝規則（SPEC §4.3、STUDIO_SPEC §4）。
 *
 * 所有部件都畫在範本檔的時間軸上（複製範本檔來畫），所以部件 sheet 的幀號就是範本的幀號：
 * - 姿勢部件：只在「姿勢幀」上有圖；身體每一幀選一個姿勢幀來用，並依錨點位移對齊。
 * - 錨點部件：只畫在「視角幀」上（正面、背面各一張），身體每一幀依 head 錨點位移貼上。
 * - 變體圖層命名為 `{圖層}@{變體}`，例如 `face@blink`、`hair_front@underHat`。
 */

/** 部件圖層跟著哪個錨點移動；null = 範本本體，每幀都有圖。 */
export const LAYER_ANCHOR: Record<AvatarLayer, AvatarSlice | null> = {
  cape: 'torso',
  hair_back: 'head',
  weapon_back: 'torso',
  body: null,
  shoes: 'torso',
  bottom: 'torso',
  top: 'torso',
  head: 'head',
  face: 'head',
  face_acc: 'head',
  eye_acc: 'head',
  hair_front: 'head',
  hat: 'head',
  weapon: 'hand',
  arm_front: null,
  sleeve: 'torso',
  glove: 'hand',
};

/** 只畫在視角幀上的圖層（錨點部件）。 */
export const VIEW_LAYERS: readonly AvatarLayer[] = ['hair_back', 'head', 'face', 'face_acc', 'eye_acc', 'hair_front', 'hat'];

export const VARIANT_SEPARATOR = '@';

export function variantLayer(layer: string, variant: string): string {
  return `${layer}${VARIANT_SEPARATOR}${variant}`;
}

/** 視角幀的預設位置：正面 = stand 第一幀、背面 = ladder 第一幀。 */
export const DEFAULT_VIEW_FRAMES = { front: { tag: 'stand', offset: 0 }, back: { tag: 'ladder', offset: 0 } } as const;

/** 依 base sheet 的 frameTags 算出視角幀（美術調整 Tag 長度時不會錯）；item.views 可覆寫。 */
export function viewFrames(base: AseSheet, views?: { front?: number; back?: number }): { front: number; back: number } {
  const front = base.tags.get(DEFAULT_VIEW_FRAMES.front.tag)?.from ?? 0;
  const back = base.tags.get(DEFAULT_VIEW_FRAMES.back.tag)?.from ?? front;
  return {
    front: views?.front ?? front + DEFAULT_VIEW_FRAMES.front.offset,
    back: views?.back ?? back + DEFAULT_VIEW_FRAMES.back.offset,
  };
}

export function viewOfTag(tag: string): 'front' | 'back' {
  return (AVATAR_TAGS as Record<string, { view: 'front' | 'back' }>)[tag]?.view ?? 'front';
}

/** 預設姿勢分配：Tag 內第 f 幀使用第幾個姿勢（平均分配）。 */
export function defaultPoseIndex(frameInTag: number, frames: number, poses: number): number {
  if (poses <= 0) return -1;
  return Math.min(poses - 1, Math.floor((frameInTag * poses) / frames));
}

/** 範本建議的姿勢幀（Tag 內位置）：姿勢 i 畫在第 floor(i × frames / poses) 幀。 */
export function suggestedPoseFrames(tag: AvatarTag): number[] {
  const { frames, poses } = AVATAR_TAGS[tag];
  return Array.from({ length: poses }, (_, i) => Math.floor((i * frames) / poses));
}

/** 某圖層在某 Tag 範圍內實際有畫的幀（由小到大）＝ 這個部件在該動作的姿勢。 */
export function posesInTag(sheet: AseSheet, layer: string, tag: AseTag): number[] {
  const frames: number[] = [];
  for (let f = tag.from; f <= tag.to; f += 1) {
    if (sheet.frame(layer, f)) frames.push(f);
  }
  return frames;
}

/**
 * 姿勢部件：身體第 bodyFrame 幀要用部件的哪一幀。
 * poseMap 是編輯器設定的「Tag 內身體幀 → 姿勢索引」；未設定時平均分配。
 * 該 Tag 完全沒畫時回傳 undefined（部件在這個動作隱藏）。
 */
export function resolvePoseFrame(
  sheet: AseSheet,
  layer: string,
  tag: AseTag,
  bodyFrame: number,
  poseMap?: Record<string, number[]>,
): number | undefined {
  const poses = posesInTag(sheet, layer, tag);
  if (poses.length === 0) return undefined;
  const frameInTag = bodyFrame - tag.from;
  const mapped = poseMap?.[tag.name]?.[frameInTag];
  const index = mapped ?? defaultPoseIndex(frameInTag, tag.to - tag.from + 1, poses.length);
  return poses[Math.max(0, Math.min(poses.length - 1, index))];
}
