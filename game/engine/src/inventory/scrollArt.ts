import * as Phaser from 'phaser';
import scrolls from '../../../assets/inventory/loot-scrolls-v4.png?url';
import { isSceneAlive, loadImages } from '../render/sheets';

export const LOOT_SCROLL_KEY = 'loot-scrolls-v4-pixel';
const SOURCE_KEY = 'loot-scrolls-v4-source';
/** 地圖掉落專用低解析圖格；34px 顯示時每顆像素約 2px，背包仍使用原圖。 */
const PIXEL_SIZE = 18;
const CELL_SIZE = PIXEL_SIZE + 2;
export const LOOT_SCROLL_COLORS: Record<number, number> = { 10: 0xffdc78, 60: 0xff9c80, 90: 0x9edafa };

/** 僅在掉落渲染時縮成粗像素圖格，不改動共用原畫。 */
export async function loadLootScrollArt(scene: Phaser.Scene): Promise<void> {
  if (scene.textures.exists(LOOT_SCROLL_KEY)) return;
  await loadImages(scene, {
    imageUrl: async path => path,
    json: async () => { throw new Error('Bundled scroll art'); },
  }, [{ key: SOURCE_KEY, path: scrolls }]);
  if (!isSceneAlive(scene) || !scene.textures.exists(SOURCE_KEY) || scene.textures.exists(LOOT_SCROLL_KEY)) return;
  const image = scene.textures.get(SOURCE_KEY).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const texture = scene.textures.createCanvas(LOOT_SCROLL_KEY, CELL_SIZE * 3, CELL_SIZE)!;
  const target = texture.context;
  // Average each source block once, then use nearest-neighbor only when enlarged in the world.
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = 'high';
  for (const [i, rate] of [10, 60, 90].entries()) {
    const left = Math.floor(i * image.width / 3), right = Math.floor((i + 1) * image.width / 3);
    let x0 = right, y0 = image.height, x1 = left, y1 = 0;
    for (let y = 0; y < image.height; y++) {
      for (let x = left; x < right; x++) {
        if (pixels[(y * image.width + x) * 4 + 3]! <= 40) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    if (x1 < x0) { x0 = left; x1 = right - 1; y0 = 0; y1 = image.height - 1; }
    const width = x1 - x0 + 1, height = y1 - y0 + 1;
    const scale = PIXEL_SIZE / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const x = i * CELL_SIZE + 1, y = 1;
    target.drawImage(image, x0, y0, width, height, x, y, w, h);
    texture.add(String(rate), 0, x, y, w, h);
  }
  // Opaque square edge pixels, without a fuzzy antialiased fringe.
  const mosaic = target.getImageData(0, 0, texture.width, texture.height);
  for (let i = 3; i < mosaic.data.length; i += 4) mosaic.data[i] = mosaic.data[i]! >= 128 ? 255 : 0;
  target.putImageData(mosaic, 0, 0);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  scene.textures.remove(SOURCE_KEY);
}
