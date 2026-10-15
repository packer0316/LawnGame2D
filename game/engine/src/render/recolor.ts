import type * as Phaser from 'phaser';
import { recolorPixels, type AseSheet, type ColorMapping } from '@lawn/shared';
import { registerSheetFrames } from './sheets';

/**
 * 依 @lawn/shared 的換色對照，把 texture 逐像素換色後存成新的 texture 並登記 frame。
 * 對照表的計算在 shared（編輯器的 Canvas2D 用同一套）；這裡只負責 Phaser 的部分。結果以 dstKey 快取。
 */
export function recolorTexture(scene: Phaser.Scene, srcKey: string, dstKey: string, mapping: ColorMapping | null, sheet: AseSheet): string {
  if (!mapping) return srcKey;
  if (scene.textures.exists(dstKey)) return dstKey;
  const source = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorPixels(image.data, mapping);
  ctx.putImageData(image, 0, 0);
  scene.textures.addCanvas(dstKey, canvas);
  registerSheetFrames(scene, dstKey, sheet);
  return dstKey;
}
