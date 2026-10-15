import { tagOfFrame, type AseSheet } from '../aseprite';
import { AVATAR_LAYERS, type AvatarItem, type AvatarLayer, type AvatarSlice } from '../content/avatar';
import { LAYER_ANCHOR, VIEW_LAYERS, resolvePoseFrame, variantLayer, viewFrames, viewOfTag } from './rig';

/**
 * 紙娃娃的「擺放計算」：第 f 幀每個圖層畫哪一張、偏移多少（SPEC §4.3、STUDIO_SPEC §4）。
 * 純函式、不依賴 Phaser；遊戲的 AvatarView 與編輯器的工具畫面（Canvas2D）共用，保證一致。
 */

/** 一個部件：設定檔 + 它的 sheet。 */
export interface AvatarPart {
  item: AvatarItem;
  sheet: AseSheet;
}

export type Expression = 'default' | 'blink' | 'hit' | 'smile';

export interface ComposeOptions {
  expression?: Expression;
}

/** 範本本體（base sheet）提供的圖層。 */
export const BASE_LAYERS: readonly AvatarLayer[] = ['body', 'arm_front', 'head'];

export interface ResolvedLoadout {
  /** 被遮蔽的圖層（hidesLayers、套服、hairMode: hidden） */
  hidden: Set<AvatarLayer>;
  /** 戴帽時頭髮用的變體（目前只有 'underHat'） */
  hairVariant: string | null;
  /** 每個圖層由誰提供：'base' 或部件；後面的部件會覆蓋前面同圖層的 */
  bindings: Map<AvatarLayer, AvatarPart | 'base'>;
}

/** 套用部件的遮蔽規則，決定每個圖層由誰提供。 */
export function resolveLoadout(parts: readonly AvatarPart[]): ResolvedLoadout {
  const bindings = new Map<AvatarLayer, AvatarPart | 'base'>();
  for (const layer of BASE_LAYERS) bindings.set(layer, 'base');
  const hidden = new Set<AvatarLayer>();
  let hairMode: AvatarItem['hairMode'] = 'full';
  for (const part of parts) {
    for (const layer of part.item.layers) bindings.set(layer, part);
    for (const layer of part.item.hidesLayers ?? []) hidden.add(layer);
    if (part.item.category === 'overall') hidden.add('bottom');
    if (part.item.hairMode) hairMode = part.item.hairMode;
  }
  if (hairMode === 'hidden') {
    hidden.add('hair_front');
    hidden.add('hair_back');
  }
  return { hidden, hairVariant: hairMode === 'underHat' ? 'underHat' : null, bindings };
}

/** 一個要畫的圖層。 */
export interface DrawOp {
  layer: AvatarLayer;
  /** 'base' 或部件的 itemId */
  source: 'base' | string;
  /** sheet 裡的圖層名（可能是 face@blink、hair_front@underHat） */
  frameLayer: string;
  /** sheet 裡的幀號 */
  frameIndex: number;
  /** 相對範本畫布左上角的偏移（像素） */
  dx: number;
  dy: number;
}

/**
 * 第 frame 幀（範本時間軸幀號）要畫的圖層，依 AVATAR_LAYERS 由後到前排序。
 * 沒畫的圖層（該動作沒有姿勢、背面沒有臉…）不會出現在結果中。
 */
export function composeAvatarFrame(
  base: AseSheet,
  loadout: readonly AvatarPart[] | ResolvedLoadout,
  frame: number,
  options: ComposeOptions = {},
): DrawOp[] {
  const resolved = isResolved(loadout) ? loadout : resolveLoadout(loadout);
  const tag = tagOfFrame(base, frame);
  if (!tag) return [];
  const view = viewOfTag(tag.name);
  const expression = options.expression ?? 'default';
  const ops: DrawOp[] = [];

  for (const layer of AVATAR_LAYERS) {
    const binding = resolved.bindings.get(layer);
    if (!binding || resolved.hidden.has(layer)) continue;
    const isBase = binding === 'base';
    const sheet = isBase ? base : binding.sheet;
    const item = isBase ? null : binding.item;
    const source = isBase ? 'base' : binding.item.id;

    // 範本本體的身體與前手臂：每幀都有圖
    if (isBase && layer !== 'head') {
      if (sheet.frame(layer, frame)) ops.push({ layer, source, frameLayer: layer, frameIndex: frame, dx: 0, dy: 0 });
      continue;
    }

    let sourceFrame: number | undefined;
    let frameLayer: string = layer;
    if (VIEW_LAYERS.includes(layer)) {
      const views = viewFrames(base, item?.views);
      sourceFrame = view === 'front' ? views.front : views.back;
      frameLayer = variantFor(layer, sheet, sourceFrame, expression, resolved.hairVariant);
    } else {
      sourceFrame = resolvePoseFrame(sheet, layer, tag, frame, item?.poseMap);
    }
    if (sourceFrame === undefined || !sheet.frame(frameLayer, sourceFrame)) continue;

    const anchor: AvatarSlice = LAYER_ANCHOR[layer] ?? 'torso';
    const now = base.slicePivotAt(anchor, frame);
    const then = base.slicePivotAt(anchor, sourceFrame);
    const offset = item?.offset ?? { x: 0, y: 0 };
    ops.push({
      layer,
      source,
      frameLayer,
      frameIndex: sourceFrame,
      dx: (now && then ? now.x - then.x : 0) + offset.x,
      dy: (now && then ? now.y - then.y : 0) + offset.y,
    });
  }
  return ops;
}

/** 表情、戴帽髮型等變體圖層；沒有畫該變體時退回原圖層。 */
function variantFor(layer: AvatarLayer, sheet: AseSheet, sourceFrame: number, expression: Expression, hairVariant: string | null): string {
  let variant: string | null = null;
  if (layer === 'face' && expression !== 'default') variant = expression;
  if ((layer === 'hair_front' || layer === 'hair_back') && hairVariant) variant = hairVariant;
  if (!variant) return layer;
  const name = variantLayer(layer, variant);
  return sheet.frame(name, sourceFrame) ? name : layer;
}

function isResolved(value: readonly AvatarPart[] | ResolvedLoadout): value is ResolvedLoadout {
  return !Array.isArray(value);
}
