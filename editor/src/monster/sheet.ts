/** 怪物 sheet 的幾何：原點在畫布底邊中央（STUDIO_SPEC §5.1、§8.1）。 */
import type { AseSheet, AseTag } from '@lawn/shared';

export const ACTIONS = ['move', 'idle', 'hit', 'die'] as const;
export type Action = (typeof ACTIONS)[number] | 'appear';

/** 自動對應 Tag 名稱：完全相同優先，其次常見的別名（不分大小寫）。 */
const SYNONYMS: Record<Action, string[]> = {
  move: ['move', 'walk', 'run', 'fly', 'patrol'],
  idle: ['idle', 'stand', 'wait'],
  hit: ['hit', 'hurt', 'damage', 'damaged'],
  die: ['die', 'death', 'dead', 'dying'],
  appear: ['appear', 'spawn', 'intro', 'enter'],
};

export function guessTag(sheet: AseSheet, action: Action): string | undefined {
  const names = [...sheet.tags.keys()];
  for (const alias of SYNONYMS[action]) {
    const found = names.find((n) => n.toLowerCase() === alias);
    if (found) return found;
  }
  return undefined;
}

/** 畫布大小（取第一幀的 sourceSize）。 */
export function canvasSize(sheet: AseSheet): { w: number; h: number } {
  return sheet.frames[0]?.sourceSize ?? { w: 0, h: 0 };
}

/** 腳底原點在畫布中的位置。 */
export function footOrigin(sheet: AseSheet): { x: number; y: number } {
  const { w, h } = canvasSize(sheet);
  return { x: Math.floor(w / 2), y: h };
}

/** Slice hitbox（某幀）→ 相對腳底的矩形。 */
export function hitboxFromSlice(sheet: AseSheet, frame = 0) {
  const key = sheet.sliceAt('hitbox', frame);
  if (!key) return undefined;
  const o = footOrigin(sheet);
  return { x: key.bounds.x - o.x, y: key.bounds.y - o.y, w: key.bounds.w, h: key.bounds.h };
}

/** Slice label 的 pivot → 相對腳底的位置。 */
export function labelFromSlice(sheet: AseSheet, frame = 0) {
  const p = sheet.slicePivotAt('label', frame);
  if (!p) return undefined;
  const o = footOrigin(sheet);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** 一個 Tag 內所有幀實際有畫的範圍（相對腳底）。 */
export function tagBounds(sheet: AseSheet, tag: AseTag) {
  const o = footOrigin(sheet);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let f = tag.from; f <= tag.to; f++) {
    const fr = sheet.frame(null, f);
    if (!fr) continue;
    x1 = Math.min(x1, fr.sourceRect.x);
    y1 = Math.min(y1, fr.sourceRect.y);
    x2 = Math.max(x2, fr.sourceRect.x + fr.sourceRect.w);
    y2 = Math.max(y2, fr.sourceRect.y + fr.sourceRect.h);
  }
  if (!Number.isFinite(x1)) return undefined;
  return { x: x1 - o.x, y: y1 - o.y, w: x2 - x1, h: y2 - y1 };
}

/** Tag 的總時間（毫秒），可套用覆寫。 */
export function tagDurationMs(sheet: AseSheet, tag: AseTag, overrides?: Record<string, number>): number {
  let total = 0;
  for (let f = tag.from; f <= tag.to; f++) total += overrides?.[String(f)] ?? sheet.frame(null, f)?.durationMs ?? 100;
  return total;
}
