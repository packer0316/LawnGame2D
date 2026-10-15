import type * as Phaser from 'phaser';
import { parseAsepriteSheet } from '@lawn/shared';
import type { SheetAsset } from '../content/bundle';
import { loadSheetAssets } from '../render/sheets';
import baseUrl from '../../../assets/outfits/ninja/export/ninja-base.png?url';
import baseRaw from '../../../assets/outfits/ninja/export/ninja-base.sheet.json';
import motionsUrl from '../../../assets/outfits/ninja/export/ninja-motions.png?url';
import motionsRaw from '../../../assets/outfits/ninja/export/ninja-motions.sheet.json';

export const NINJA_BASE: SheetAsset = {path:'outfit-ninja-base',image:baseUrl,sheet:parseAsepriteSheet(baseRaw)};
export const NINJA_MOTIONS: SheetAsset = {path:'outfit-ninja-motions',image:motionsUrl,sheet:parseAsepriteSheet(motionsRaw)};
export async function loadOutfitArt(scene: Phaser.Scene): Promise<void> {
  await loadSheetAssets(scene,{imageUrl:async path=>path,json:async()=>{throw new Error('Outfit metadata is bundled');}},[NINJA_BASE,NINJA_MOTIONS]);
}
