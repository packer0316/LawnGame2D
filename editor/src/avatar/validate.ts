/** 角色與武器的規格檢查（STUDIO_SPEC §4.5）。 */
import { AVATAR_TAGS, AvatarItemSchema, posesInTag } from '@lawn/shared';
import type { AseSheet, AvatarItem } from '@lawn/shared';
import type { Issue } from '../state/validation';
import { WEAPON_LAYERS, requiredTags } from './defaults';

const EXPECTED_FRAMES = Object.values(AVATAR_TAGS).reduce((n, t) => n + t.frames, 0);

/** 角色檔：15 個 Tag、67 幀、body 圖層、hand 與 torso 錨點。 */
export function validateBase(base: AseSheet | null): Issue[] {
  const issues: Issue[] = [];
  const path = 'avatar/base.sheet.json';
  const error = (message: string) => issues.push({ severity: 'error', page: 'avatar', path, target: 'base', message: `角色：${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', page: 'avatar', path, target: 'base', message: `角色：${message}` });
  if (!base) {
    error('找不到 content/avatar/base.sheet.json（請用 Aseprite 匯出 art/avatar/avatar_base.aseprite）');
    return issues;
  }
  for (const [name, spec] of Object.entries(AVATAR_TAGS)) {
    const tag = base.tags.get(name);
    if (!tag) {
      error(`缺少動作 Tag「${name}」`);
      continue;
    }
    const n = tag.to - tag.from + 1;
    if (n !== spec.frames) warn(`動作 ${name} 有 ${n} 幀，規格是 ${spec.frames} 幀`);
    const missing: number[] = [];
    for (let f = tag.from; f <= tag.to; f++) if (!base.frame('body', f)) missing.push(f - tag.from);
    if (missing.length) error(`動作 ${name} 的第 ${missing.join('、')} 幀沒有畫 body`);
  }
  const total = [...base.tags.values()].filter((t) => t.name in AVATAR_TAGS).reduce((n, t) => n + t.to - t.from + 1, 0);
  if (total !== EXPECTED_FRAMES) warn(`角色共 ${total} 幀，規格是 ${EXPECTED_FRAMES} 幀`);
  if (!base.layers.includes('body')) error('缺少圖層「body」');
  for (const s of ['hand', 'torso']) {
    const keys = base.slices.get(s);
    if (!keys?.length) error(`缺少錨點 Slice「${s}」`);
    else if (keys.some((k) => !k.pivot)) warn(`錨點 ${s} 有幀沒有設定 pivot，會用中心點`);
  }
  return issues;
}

/** 武器：必須設定職業、只用 weapon／weapon_back、通用動作與自己職業的攻擊動作都要有姿勢圖。 */
export function validateItem(item: AvatarItem, sheet: AseSheet | null, base: AseSheet | null): Issue[] {
  const issues: Issue[] = [];
  const path = `avatar/items/${item.id}.json`;
  const error = (message: string) => issues.push({ severity: 'error', page: 'avatar', path, target: item.id, message: `${item.id}：${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', page: 'avatar', path, target: item.id, message: `${item.id}：${message}` });

  if (item.category !== 'weapon') {
    // v0.3 起角色不換裝；舊的部件留著不擋匯出，但遊戲不再使用
    warn(`分類是 ${item.category}，STUDIO_SPEC v0.3 起只有武器可以更換，這個部件不會被使用`);
    return issues;
  }
  const parsed = AvatarItemSchema.safeParse(item);
  if (!parsed.success) for (const i of parsed.error.issues) error(`${i.path.map(String).join('.')}：${i.message}`);
  if (!item.classId) error('沒有設定職業');
  const badLayers = item.layers.filter((l) => !WEAPON_LAYERS.includes(l));
  if (badLayers.length) error(`武器只能用 weapon、weapon_back 圖層，不能用 ${badLayers.join('、')}`);
  if (!sheet) {
    error(`找不到 sheet ${item.sheet}`);
    return issues;
  }
  if (!base) return issues;

  for (const layer of item.layers.filter((l) => WEAPON_LAYERS.includes(l))) {
    if (!sheet.frames.some((f) => f.layer === layer)) {
      error(`圖層 ${layer} 在 sheet 中沒有任何圖`);
      continue;
    }
    // weapon_back 是選配：不檢查每個動作都要有
    if (layer !== 'weapon') continue;
    const missing = requiredTags(item, Object.keys(AVATAR_TAGS)).filter((name) => {
      const tag = base.tags.get(name);
      return tag ? posesInTag(sheet, layer, tag).length === 0 : false;
    });
    if (missing.length > 0) error(`這些動作沒有姿勢圖：${missing.join('、')}`);
  }
  for (const [tagName, map] of Object.entries(item.poseMap ?? {})) {
    const tag = base.tags.get(tagName);
    if (!tag) {
      warn(`姿勢表有不存在的動作 ${tagName}`);
      continue;
    }
    const poses = posesInTag(sheet, 'weapon', tag).length;
    const bad = map.filter((i) => i >= poses);
    if (poses > 0 && bad.length) warn(`${tagName} 的姿勢表指定了不存在的姿勢 ${bad.join('、')}（只有 ${poses} 個），會使用最後一個`);
  }
  return issues;
}
