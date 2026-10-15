import * as Phaser from 'phaser';
import { parseAsepriteSheet, type AseSheet } from '@lawn/shared';
import heroMotionsUrl from '../../../assets/verdant/motions/export/hero-motions.png?url';
import heroMotionsRaw from '../../../assets/verdant/motions/export/hero-motions.sheet.json';
import { isSceneAlive, registerSheetFrames } from '../render/sheets';

/**
 * 森境旅人的技能整體動畫（Codex 製作，game/assets/verdant/motions）：人物與武器合圖、
 * 128×128、原點 (64,120)、面向左，跟紙娃娃的 AVATAR_CANVAS 一致。播放時取代紙娃娃。
 * 這是遊戲自帶的素材，不經過 content/。
 */
export const HERO_MOTIONS_KEY = 'hero-motions';
export const heroMotionsSheet: AseSheet = parseAsepriteSheet(heroMotionsRaw);

/** 動作 Tag 在 1 倍速下的總長（毫秒）；沒有這個 Tag 回傳 0。 */
export function motionDuration(tag: string): number {
  const info = heroMotionsSheet.tags.get(tag);
  if (!info) return 0;
  let total = 0;
  for (let f = info.from; f <= info.to; f += 1) total += heroMotionsSheet.frame(null, f)?.durationMs ?? 100;
  return total;
}

export async function loadHeroMotions(scene: Phaser.Scene): Promise<void> {
  if (!isSceneAlive(scene)) return;
  if (!scene.textures.exists(HERO_MOTIONS_KEY)) {
    await new Promise<void>((resolve) => {
      scene.load.image(HERO_MOTIONS_KEY, heroMotionsUrl);
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      scene.load.start();
    });
  }
  registerSheetFrames(scene, HERO_MOTIONS_KEY, heroMotionsSheet);
}
