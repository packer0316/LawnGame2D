import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Canvas } from './raster';

/**
 * 模擬 Aseprite CLI 的輸出（STUDIO_SPEC §2、§8.1）：
 * --format json-array --list-tags --list-slices --list-layers --sheet-type packed --trim --shape-padding 1
 * 一般 sheet 的 frame 名稱是 "{frame}"；分層 sheet 是 "{layer}|{frame}"，空白幀略過（--ignore-empty）。
 */

export interface SheetFrame {
  layer: string | null;
  /** 時間軸幀號 */
  index: number;
  canvas: Canvas;
  durationMs: number;
}

export interface SheetTag {
  name: string;
  from: number;
  to: number;
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse';
}

export interface SheetSliceKey {
  frame: number;
  bounds: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
}

export interface SheetSpec {
  frames: SheetFrame[];
  tags: SheetTag[];
  slices?: { name: string; color?: string; keys: SheetSliceKey[] }[];
  layers?: string[];
}

const PADDING = 1;

/** 寫出 {name}.png 與 {name}.sheet.json 到 dir。回傳 sheet 的像素大小。 */
export function writeSheet(dir: string, name: string, spec: SheetSpec): { w: number; h: number } {
  type Packed = { frame: SheetFrame; trim: { x: number; y: number; w: number; h: number }; image: Canvas; x: number; y: number };
  const items: Packed[] = [];
  for (const frame of spec.frames) {
    const trim = frame.canvas.bounds();
    if (!trim) {
      if (frame.layer !== null) continue; // 分層匯出：--ignore-empty
      items.push({ frame, trim: { x: 0, y: 0, w: 1, h: 1 }, image: new Canvas(1, 1), x: 0, y: 0 });
      continue;
    }
    items.push({ frame, trim, image: frame.canvas.crop(trim.x, trim.y, trim.w, trim.h), x: 0, y: 0 });
  }

  // 簡單的 shelf packing：依高度排序，逐列擺放。
  const area = items.reduce((sum, item) => sum + (item.image.width + PADDING) * (item.image.height + PADDING), 0);
  const maxItemWidth = Math.max(1, ...items.map((item) => item.image.width + PADDING));
  let sheetWidth = Math.max(maxItemWidth, 1 << Math.ceil(Math.log2(Math.sqrt(area) * 1.1 || 1)));
  sheetWidth = Math.min(sheetWidth, 2048);
  const order = [...items].sort((a, b) => b.image.height - a.image.height);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const item of order) {
    if (cursorX + item.image.width > sheetWidth) {
      cursorX = 0;
      cursorY += rowHeight + PADDING;
      rowHeight = 0;
    }
    item.x = cursorX;
    item.y = cursorY;
    cursorX += item.image.width + PADDING;
    rowHeight = Math.max(rowHeight, item.image.height);
  }
  const sheetHeight = cursorY + rowHeight;

  const png = new PNG({ width: sheetWidth, height: Math.max(1, sheetHeight) });
  png.data.fill(0);
  for (const item of items) {
    for (let y = 0; y < item.image.height; y += 1) {
      for (let x = 0; x < item.image.width; x += 1) {
        const color = item.image.get(x, y);
        const i = ((item.y + y) * sheetWidth + item.x + x) * 4;
        png.data[i] = color[0];
        png.data[i + 1] = color[1];
        png.data[i + 2] = color[2];
        png.data[i + 3] = color[3];
      }
    }
  }

  const sorted = [...items].sort((a, b) => (a.frame.layer ?? '').localeCompare(b.frame.layer ?? '') || a.frame.index - b.frame.index);
  const json = {
    frames: sorted.map((item) => ({
      filename: item.frame.layer === null ? String(item.frame.index) : `${item.frame.layer}|${item.frame.index}`,
      frame: { x: item.x, y: item.y, w: item.image.width, h: item.image.height },
      rotated: false,
      trimmed: item.trim.w !== item.frame.canvas.width || item.trim.h !== item.frame.canvas.height,
      spriteSourceSize: item.trim,
      sourceSize: { w: item.frame.canvas.width, h: item.frame.canvas.height },
      duration: item.frame.durationMs,
    })),
    meta: {
      app: 'https://www.aseprite.org/',
      version: 'placeholder-art',
      image: `${name}.png`,
      format: 'RGBA8888',
      size: { w: sheetWidth, h: Math.max(1, sheetHeight) },
      scale: '1',
      frameTags: spec.tags.map((tag) => ({ name: tag.name, from: tag.from, to: tag.to, direction: tag.direction ?? 'forward', color: '#000000ff' })),
      layers: (spec.layers ?? []).map((layer) => ({ name: layer, opacity: 255, blendMode: 'normal' })),
      slices: (spec.slices ?? []).map((slice) => ({ name: slice.name, color: slice.color ?? '#0000ffff', keys: slice.keys })),
    },
  };

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), PNG.sync.write(png));
  fs.writeFileSync(path.join(dir, `${name}.sheet.json`), `${JSON.stringify(json, null, 1)}\n`);
  return { w: sheetWidth, h: sheetHeight };
}

/** 單張圖（tileset、背景）。 */
export function writePng(file: string, canvas: Canvas): void {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  png.data.set(canvas.data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
