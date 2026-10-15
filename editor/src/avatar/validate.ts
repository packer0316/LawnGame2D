/** 角色造型的規格檢查（STUDIO_SPEC §4.6）。 */
import { AVATAR_SLICES, AVATAR_TAGS, AvatarItemSchema, PaletteFileSchema, posesInTag, variantLayer, viewFrames } from '@lawn/shared';
import type { AseSheet, AvatarItem, PaletteFile } from '@lawn/shared';
import type { Issue } from '../state/validation';
import { isViewLayer, requiredTags } from './defaults';

const EXPECTED_FRAMES = Object.values(AVATAR_TAGS).reduce((n, t) => n + t.frames, 0);

/** 從背後看不到的錨點部件，不需要背面圖。 */
const NO_BACK_CATEGORIES: AvatarItem['category'][] = ['face', 'faceAcc', 'eyeAcc'];

/** 基礎身體：15 個 Tag、67 幀、body／arm_front／head 圖層、head／torso／hand 錨點。 */
export function validateBase(base: AseSheet | null): Issue[] {
  const issues: Issue[] = [];
  const path = 'avatar/base.sheet.json';
  const error = (message: string) => issues.push({ severity: 'error', page: 'avatar', path, target: 'base', message: `身體：${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', page: 'avatar', path, target: 'base', message: `身體：${message}` });
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
  }
  const total = [...base.tags.values()].filter((t) => t.name in AVATAR_TAGS).reduce((n, t) => n + t.to - t.from + 1, 0);
  if (total !== EXPECTED_FRAMES) warn(`身體共 ${total} 幀，規格是 ${EXPECTED_FRAMES} 幀`);
  for (const layer of ['body', 'arm_front', 'head']) {
    if (!base.layers.includes(layer)) error(`缺少圖層「${layer}」`);
  }
  for (const s of AVATAR_SLICES) {
    const keys = base.slices.get(s);
    if (!keys?.length) error(`缺少錨點 Slice「${s}」`);
    else if (keys.some((k) => !k.pivot)) warn(`錨點 ${s} 有幀沒有設定 pivot，會用中心點`);
  }
  // 視角幀要有頭
  const views = viewFrames(base);
  if (!base.frame('head', views.front)) error(`正面視角幀（第 ${views.front} 幀，stand 第一幀）沒有畫頭`);
  if (!base.frame('head', views.back)) error(`背面視角幀（第 ${views.back} 幀，ladder 第一幀）沒有畫頭`);
  return issues;
}

/** 部件：每個需要的 Tag 都要有姿勢圖；錨點部件要有正面圖（臉以外還要有背面圖）。 */
export function validateItem(item: AvatarItem, sheet: AseSheet | null, base: AseSheet | null, opts: { underHatUsed?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  const path = `avatar/items/${item.id}.json`;
  const error = (message: string) => issues.push({ severity: 'error', page: 'avatar', path, target: item.id, message: `${item.id}：${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', page: 'avatar', path, target: item.id, message: `${item.id}：${message}` });

  const parsed = AvatarItemSchema.safeParse(item);
  if (!parsed.success) for (const i of parsed.error.issues) error(`${i.path.map(String).join('.')}：${i.message}`);
  if (item.category === 'weapon' && !item.classId) warn('武器沒有設定職業限制');
  if (!sheet) {
    error(`找不到 sheet ${item.sheet}`);
    return issues;
  }
  if (!base) return issues;

  // 錨點部件：每個圖層都要有正面圖；背面圖整件至少一個圖層有（例：從背後看頭髮畫在 hair_front）。
  // 臉、臉飾、眼飾從背後看不到，不需要背面。
  const views = viewFrames(base, item.views);
  const viewLayers = item.layers.filter((l) => item.kind === 'anchor' || isViewLayer(l));
  if (viewLayers.length > 0) {
    const needsBack = !NO_BACK_CATEGORIES.includes(item.category);
    if (needsBack && !viewLayers.some((l) => sheet.frame(l, views.back))) {
      error(`沒有背面圖（第 ${views.back} 幀，ladder 第一幀）：${viewLayers.join('、')} 都沒有畫`);
    }
  }

  for (const layer of item.layers) {
    const drawn = sheet.frames.some((f) => f.layer === layer);
    if (!drawn) {
      error(`圖層 ${layer} 在 sheet 中沒有任何圖`);
      continue;
    }
    if (viewLayers.includes(layer)) {
      if (!sheet.frame(layer, views.front)) error(`圖層 ${layer} 沒有正面圖（第 ${views.front} 幀，stand 第一幀）`);
      continue;
    }
    const tags = requiredTags(item, Object.keys(AVATAR_TAGS));
    const missing = tags.filter((name) => {
      const tag = base.tags.get(name);
      return tag ? posesInTag(sheet, layer, tag).length === 0 : false;
    });
    if (missing.length > 0) error(`圖層 ${layer} 在這些動作沒有姿勢圖：${missing.join('、')}`);
    // poseMap 的姿勢索引要在範圍內
    for (const [tagName, map] of Object.entries(item.poseMap ?? {})) {
      const tag = base.tags.get(tagName);
      if (!tag) {
        warn(`姿勢表有不存在的動作 ${tagName}`);
        continue;
      }
      const poses = posesInTag(sheet, layer, tag).length;
      const bad = map.filter((i) => i >= poses);
      if (poses > 0 && bad.length) warn(`圖層 ${layer} 的 ${tagName} 姿勢表指定了不存在的姿勢 ${bad.join('、')}（只有 ${poses} 個），會使用最後一個`);
    }
  }

  // 變體
  if (item.layers.includes('face')) {
    const front = viewFrames(base, item.views).front;
    for (const v of ['blink', 'hit', 'smile']) {
      if (!sheet.frame(variantLayer('face', v), front)) warn(`沒有表情 face@${v}（會用預設表情）`);
    }
  }
  if (opts.underHatUsed && (item.layers.includes('hair_front') || item.layers.includes('hair_back'))) {
    const front = viewFrames(base, item.views).front;
    if (!item.layers.some((l) => sheet.frame(variantLayer(l, 'underHat'), front))) warn('沒有戴帽版（@underHat），戴帽子時會用完整髮型');
  }
  return issues;
}

export function validatePalettes(file: PaletteFile | undefined): Issue[] {
  const path = 'avatar/palettes.json';
  if (!file) return [{ severity: 'error', page: 'avatar', path, target: 'palettes', message: '缺少調色盤 avatar/palettes.json' }];
  const issues: Issue[] = [];
  const parsed = PaletteFileSchema.safeParse(file);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ severity: 'error', page: 'avatar', path, target: 'palettes', message: `調色盤：${i.message}` });
  }
  const ids = new Set<string>();
  for (const p of file.palettes) {
    if (ids.has(p.id)) issues.push({ severity: 'error', page: 'avatar', path, target: 'palettes', message: `調色盤 ID ${p.id} 重複` });
    ids.add(p.id);
  }
  for (const group of ['skin', 'hair', 'eye', 'dye'] as const) {
    if (!file.palettes.some((p) => p.group === group)) issues.push({ severity: 'warning', page: 'avatar', path, target: 'palettes', message: `調色盤：${group} 群組沒有任何顏色` });
    const keys = file.keyRamps[group].map((c) => c.toLowerCase());
    if (new Set(keys).size !== keys.length) issues.push({ severity: 'error', page: 'avatar', path, target: 'palettes', message: `Key 色階 ${group} 有重複的顏色` });
  }
  // 不同群組的 Key 色不能相同，否則換色時會互相干擾
  const all = (['skin', 'hair', 'eye', 'dye'] as const).flatMap((g) => file.keyRamps[g].map((c) => [g, c.toLowerCase()] as const));
  const seen = new Map<string, string>();
  for (const [g, c] of all) {
    const other = seen.get(c);
    if (other && other !== g) issues.push({ severity: 'error', page: 'avatar', path, target: 'palettes', message: `Key 色 ${c} 同時出現在 ${other} 與 ${g}` });
    seen.set(c, g);
  }
  return issues;
}
