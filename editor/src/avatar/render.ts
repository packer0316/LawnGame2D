/**
 * 紙娃娃的 Canvas 2D 繪製：擺放計算與換色都用 @lawn/shared（composeAvatarFrame、loadoutMapping、recolorPixels），
 * 跟遊戲的 AvatarView 算出來一模一樣。用在姿勢表逐幀檢查、錨點對齊、部件圖示。
 */
import { AVATAR_CANVAS, composeAvatarFrame, loadoutMapping, recolorPixels, resolveLoadout } from '@lawn/shared';
import type { AseSheet, AvatarItem, AvatarLoadout, ComposeOptions, DrawOp, PaletteFile, ResolvedLoadout } from '@lawn/shared';

export interface SheetImage {
  sheet: AseSheet;
  image: ImageBitmap | null;
}

export interface RenderPart extends SheetImage {
  item: AvatarItem;
}

type Drawable = ImageBitmap | OffscreenCanvas;

/** 換色後的圖（以「圖 + 對照表」快取）。 */
const recolorCache = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>();

function recolored(image: ImageBitmap, palettes: PaletteFile | undefined, loadout: AvatarLoadout | null, item: AvatarItem | null): Drawable {
  if (!palettes || !loadout) return image;
  const mapping = loadoutMapping(palettes, loadout, item);
  if (!mapping) return image;
  const key = [...mapping].map(([k, v]) => `${k}:${v.join(',')}`).join('|');
  let byKey = recolorCache.get(image);
  if (!byKey) recolorCache.set(image, (byKey = new Map()));
  let canvas = byKey.get(key);
  if (!canvas) {
    canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height);
    recolorPixels(data.data, mapping);
    ctx.putImageData(data, 0, 0);
    byKey.set(key, canvas);
  }
  return canvas;
}

export class AvatarRenderer {
  private readonly resolved: ResolvedLoadout;
  private readonly sources = new Map<string, { sheet: AseSheet; image: Drawable | null }>();

  constructor(
    readonly base: SheetImage,
    readonly parts: RenderPart[],
    palettes?: PaletteFile,
    loadout?: AvatarLoadout | null,
  ) {
    this.resolved = resolveLoadout(parts.map((p) => ({ item: p.item, sheet: p.sheet })));
    this.sources.set('base', { sheet: base.sheet, image: base.image ? recolored(base.image, palettes, loadout ?? null, null) : null });
    for (const p of parts) {
      this.sources.set(p.item.id, { sheet: p.sheet, image: p.image ? recolored(p.image, palettes, loadout ?? null, p.item) : null });
    }
  }

  ops(frame: number, options?: ComposeOptions): DrawOp[] {
    return composeAvatarFrame(this.base.sheet, this.resolved, frame, options);
  }

  /**
   * 畫一幀：(footX, footY) 是腳底在畫布上的位置，scale 為整數倍。
   * filter 可以只畫某些 DrawOp（例如只畫部件、做圖示）。
   */
  draw(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    frame: number,
    footX: number,
    footY: number,
    scale: number,
    options: ComposeOptions & { filter?: (op: DrawOp) => boolean; alpha?: number } = {},
  ): void {
    ctx.imageSmoothingEnabled = false;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = options.alpha ?? 1;
    for (const op of this.ops(frame, options)) {
      if (options.filter && !options.filter(op)) continue;
      const src = this.sources.get(op.source);
      const fr = src?.sheet.frame(op.frameLayer, op.frameIndex);
      if (!src?.image || !fr) continue;
      const x = footX + (op.dx + fr.sourceRect.x - AVATAR_CANVAS.footX) * scale;
      const y = footY + (op.dy + fr.sourceRect.y - AVATAR_CANVAS.footY) * scale;
      ctx.drawImage(src.image, fr.rect.x, fr.rect.y, fr.rect.w, fr.rect.h, x, y, fr.rect.w * scale, fr.rect.h * scale);
    }
    ctx.globalAlpha = prevAlpha;
  }
}

/** 範本畫布上某幀錨點的位置（相對腳底）。 */
export function anchorAt(base: AseSheet, slice: string, frame: number): { x: number; y: number } | null {
  const p = base.slicePivotAt(slice, frame);
  return p ? { x: p.x - AVATAR_CANVAS.footX, y: p.y - AVATAR_CANVAS.footY } : null;
}

export const ICON_SIZE = 32;

/**
 * 部件圖示：用 stand 第一幀（錨點部件為正面視角）只畫這個部件，裁掉空白後置中；
 * 盡量用整數倍放大，放不下時才最近鄰縮小（像素風，不模糊）。
 */
export function renderIcon(renderer: AvatarRenderer, itemId: string, frame: number): OffscreenCanvas {
  const work = new OffscreenCanvas(AVATAR_CANVAS.w * 2, AVATAR_CANVAS.h * 2);
  const wctx = work.getContext('2d')!;
  renderer.draw(wctx, frame, AVATAR_CANVAS.w, AVATAR_CANVAS.h + 8, 1, { filter: (op) => op.source === itemId });
  const { data, width, height } = wctx.getImageData(0, 0, work.width, work.height);
  let x1 = width;
  let y1 = height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  const icon = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  if (x2 < 0) return icon;
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;
  const ctx = icon.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const fit = (ICON_SIZE - 2) / Math.max(w, h);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  ctx.drawImage(work, x1, y1, w, h, Math.floor((ICON_SIZE - dw) / 2), Math.floor((ICON_SIZE - dh) / 2), dw, dh);
  return icon;
}
