import type * as Phaser from 'phaser';
import { isSceneAlive, loadImages } from '../render/sheets';
import portrait from '../../../assets/skills/reaper-summon/portrait-v1.png?url';
import scythe from '../../../assets/skills/reaper-summon/scythe-v1.png?url';

export const REAPER_ART = { portrait, scythe };
export const reaperKey = (name: keyof typeof REAPER_ART): string => `reaper-summon-${name}`;

export async function loadReaperSummonArt(scene: Phaser.Scene): Promise<void> {
  await loadImages(scene, { imageUrl: async path => path, json: async () => { throw Error('死神素材只讀圖片'); } },
    Object.entries(REAPER_ART).map(([name, path]) => ({ key: reaperKey(name as keyof typeof REAPER_ART), path })));
  if (!isSceneAlive(scene)) return;
  for (const name of Object.keys(REAPER_ART) as (keyof typeof REAPER_ART)[]) {
    const key = reaperKey(name);
    if (!scene.textures.exists(key)) throw Error(`死神召喚素材載入失敗：${name}`);
    const texture = scene.textures.get(key), image = texture.getSourceImage() as HTMLImageElement;
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(i % 4 * image.width / 4), y = Math.floor(Math.floor(i / 4) * image.height / 2);
      const right = Math.floor((i % 4 + 1) * image.width / 4), bottom = Math.floor((Math.floor(i / 4) + 1) * image.height / 2);
      if (!texture.has(String(i))) texture.add(i, 0, x, y, right - x, bottom - y);
    }
  }
}
