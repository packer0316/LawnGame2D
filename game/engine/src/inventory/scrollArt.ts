import * as Phaser from 'phaser';
import scrolls from '../../../assets/inventory/loot-scrolls-v3.png?url';
import { isSceneAlive, loadImages } from '../render/sheets';

export const LOOT_SCROLL_KEY = 'loot-scrolls-v3';
export const LOOT_SCROLL_COLORS: Record<number, number> = { 10: 0xc39aff, 60: 0xffd373, 90: 0x7ce3b0 };

/** 三款掉落卷軸；依透明邊界裁幀，避免圖集留白使小圖偏心或大小不一。 */
export async function loadLootScrollArt(scene: Phaser.Scene): Promise<void> {
  await loadImages(scene, {
    imageUrl: async path => path,
    json: async () => { throw new Error('Bundled scroll art'); },
  }, [{ key: LOOT_SCROLL_KEY, path: scrolls }]);
  if (!isSceneAlive(scene) || !scene.textures.exists(LOOT_SCROLL_KEY)) return;
  const texture = scene.textures.get(LOOT_SCROLL_KEY);
  if ([10, 60, 90].every(rate => texture.has(String(rate)))) return;
  const image = texture.getSourceImage() as HTMLImageElement;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  for (const [i, rate] of [10, 60, 90].entries()) {
    if (texture.has(String(rate))) continue;
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
    texture.add(String(rate), 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
}
