import * as Phaser from 'phaser';
import { WEAPON_ART, SCABBARD_ART } from './art';
import { isSceneAlive } from '../render/sheets';
export async function loadInventoryArt(scene: Phaser.Scene): Promise<void> {
  if (!isSceneAlive(scene)) return;
  const art = { ...WEAPON_ART, scabbard: SCABBARD_ART };
  const pending = Object.entries(art).filter(([kind]) => !scene.textures.exists(`wardrobe-${kind}`));
  if (pending.length) {
    for (const [kind, url] of pending) scene.load.image(`wardrobe-${kind}`, url);
    await new Promise<void>((resolve) => { scene.load.once(Phaser.Loader.Events.COMPLETE, resolve); scene.load.start(); });
  }
  if (!isSceneAlive(scene)) return;
  for (const kind of Object.keys(art)) {
    const texture = scene.textures.get(`wardrobe-${kind}`);
    const source = texture.getSourceImage() as HTMLImageElement;
    for (let i = 0; i < 10; i++) {
      const x = Math.round(i % 5 * source.width / 5), y = Math.round(Math.floor(i / 5) * source.height / 2);
      if (!texture.has(String(i))) texture.add(String(i), 0, x, y, Math.round((i % 5 + 1) * source.width / 5) - x, Math.round((Math.floor(i / 5) + 1) * source.height / 2) - y);
    }
  }
}
