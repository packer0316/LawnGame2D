import type * as Phaser from 'phaser';
import { parseAsepriteSheet } from '@lawn/shared';
import type { SheetAsset } from '../content/bundle';
import { loadSheetAssets } from '../render/sheets';
import baseUrl from '../../../assets/outfits/ninja/export/ninja-base.png?url';
import baseRaw from '../../../assets/outfits/ninja/export/ninja-base.sheet.json';
import motionsUrl from '../../../assets/outfits/ninja/export/ninja-motions.png?url';
import motionsRaw from '../../../assets/outfits/ninja/export/ninja-motions.sheet.json';
import hoodBaseUrl from '../../../assets/outfits/hood/export/hood-base.png?url';
import hoodBaseRaw from '../../../assets/outfits/hood/export/hood-base.sheet.json';
import hoodMotionsUrl from '../../../assets/outfits/hood/export/hood-motions.png?url';
import hoodMotionsRaw from '../../../assets/outfits/hood/export/hood-motions.sheet.json';

export const NINJA_BASE: SheetAsset = {path:'outfit-ninja-base',image:baseUrl,sheet:parseAsepriteSheet(baseRaw)};
export const NINJA_MOTIONS: SheetAsset = {path:'outfit-ninja-motions',image:motionsUrl,sheet:parseAsepriteSheet(motionsRaw)};
export const OUTFIT_VISUALS = new Map<string, {base: SheetAsset; motions: SheetAsset}>([
  ['ninja-1', {base:NINJA_BASE, motions:NINJA_MOTIONS}],
  ['hood-1', {
    base:{path:'outfit-hood-base',image:hoodBaseUrl,sheet:parseAsepriteSheet(hoodBaseRaw)},
    motions:{path:'outfit-hood-motions',image:hoodMotionsUrl,sheet:parseAsepriteSheet(hoodMotionsRaw)},
  }],
]);
export async function loadOutfitArt(scene: Phaser.Scene): Promise<void> {
  await loadSheetAssets(scene,{imageUrl:async path=>path,json:async()=>{throw new Error('Outfit metadata is bundled');}},[...OUTFIT_VISUALS.values()].flatMap(o=>[o.base,o.motions]));
}
