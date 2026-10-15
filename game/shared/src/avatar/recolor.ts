import type { AvatarItem, AvatarLoadout, PaletteFile, PaletteGroup } from '../content/avatar';

/**
 * 紙娃娃換色（SPEC §4.3「Key 色階 + 調色盤替換」）。只算對照表與逐像素替換，
 * 不依賴 Phaser；遊戲（WebGL texture）與編輯器（Canvas2D）共用。
 */

/** Key 色階的 RGB 整數 → 目標顏色 [r, g, b]。 */
export type ColorMapping = Map<number, [number, number, number]>;

const rgbInt = (hex: string) => Number.parseInt(hex.slice(1, 7), 16);
const rgbTuple = (hex: string): [number, number, number] => {
  const value = rgbInt(hex);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

/** 某群組 Key 色階 → 某顏色的對照；顏色不存在或跟 Key 一樣時回傳 null。 */
export function paletteMapping(palettes: PaletteFile, group: PaletteGroup, paletteId: string | undefined): ColorMapping | null {
  if (!paletteId) return null;
  const palette = palettes.palettes.find((p) => p.id === paletteId && p.group === group);
  if (!palette) return null;
  const keys = palettes.keyRamps[group];
  const mapping: ColorMapping = new Map();
  keys.forEach((key, i) => {
    const target = palette.colors[i];
    if (target && target.toLowerCase() !== key.toLowerCase()) mapping.set(rgbInt(key), rgbTuple(target));
  });
  return mapping.size > 0 ? mapping : null;
}

/** 合併多組對照（例如同一張圖同時有膚色與髮色）；後面的優先。 */
export function mergeMappings(...mappings: (ColorMapping | null | undefined)[]): ColorMapping | null {
  const merged: ColorMapping = new Map();
  for (const mapping of mappings) if (mapping) for (const [k, v] of mapping) merged.set(k, v);
  return merged.size > 0 ? merged : null;
}

/** 這個部件在這套外觀下要用哪個顏色（沒有換色群組時回傳 undefined）。 */
export function itemPaletteId(item: AvatarItem, loadout: AvatarLoadout): string | undefined {
  switch (item.recolor) {
    case 'hair':
      return loadout.hair;
    case 'eye':
      return loadout.eye;
    case 'dye':
      return loadout.dyes?.[item.id];
    default:
      return undefined;
  }
}

/**
 * 某張 sheet 在這套外觀下的完整對照：膚色一律套用（部件可能畫到皮膚），
 * 再加上部件自己的換色群組。item 為 null 表示範本本體（只套膚色）。
 */
export function loadoutMapping(palettes: PaletteFile, loadout: AvatarLoadout, item: AvatarItem | null): ColorMapping | null {
  const skin = paletteMapping(palettes, 'skin', loadout.skin);
  if (!item?.recolor) return skin;
  return mergeMappings(skin, paletteMapping(palettes, item.recolor, itemPaletteId(item, loadout)));
}

/** 逐像素把 Key 色階換成目標顏色（RGBA，原地修改）。透明像素略過。 */
export function recolorPixels(data: Uint8ClampedArray | Uint8Array, mapping: ColorMapping): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const target = mapping.get((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    if (target) {
      data[i] = target[0];
      data[i + 1] = target[1];
      data[i + 2] = target[2];
    }
  }
}
