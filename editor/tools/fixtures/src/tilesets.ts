import { Bitmap, rgba } from './png';
import { GRID, TILE } from './ldtkBuilder';

export interface TilesetPalette {
  top: string;
  topDark: string;
  dirt: string;
  dirtDark: string;
  dirtLight: string;
  wood: string;
  woodDark: string;
  rope: string;
  accent: string;
  accent2: string;
}

export const PALETTES: Record<string, TilesetPalette> = {
  forest: {
    top: '#5dae45', topDark: '#3b7a2c', dirt: '#8a5a34', dirtDark: '#5e3b22', dirtLight: '#a8744a',
    wood: '#c99a5b', woodDark: '#7a5530', rope: '#d9c28c', accent: '#f2d64b', accent2: '#e8607a',
  },
  cave: {
    top: '#7d8fb8', topDark: '#4d5a7c', dirt: '#4a4f66', dirtDark: '#2e3142', dirtLight: '#646a85',
    wood: '#9a8466', woodDark: '#5a4a38', rope: '#bfae88', accent: '#6fe0ff', accent2: '#a07bff',
  },
  ruins: {
    top: '#8c7aa8', topDark: '#5a4a72', dirt: '#5a4e5e', dirtDark: '#3a3140', dirtLight: '#76687a',
    wood: '#8a7a6a', woodDark: '#4e4238', rope: '#b8a890', accent: '#ffb14a', accent2: '#c86bff',
  },
};

export const TILESET_COLS = 8;
export const TILESET_ROWS = 2;

/** 依調色盤畫出 8×2 格的測試 tileset。 */
export function paintTileset(p: TilesetPalette): Bitmap {
  const bmp = new Bitmap(TILESET_COLS * GRID, TILESET_ROWS * GRID);
  const c = (hex: string) => rgba(hex);
  const origin = (t: number) => [(t % TILESET_COLS) * GRID, Math.floor(t / TILESET_COLS) * GRID] as const;
  const px = (t: number, x: number, y: number, color: string) => {
    const [ox, oy] = origin(t);
    bmp.set(ox + x, oy + y, c(color));
  };
  const speckle = (x: number, y: number) => ((x * 7 + y * 13) % 11 === 0 ? 1 : (x * 5 + y * 3) % 17 === 0 ? 2 : 0);
  const dirtAt = (x: number, y: number) => {
    const s = speckle(x, y);
    return s === 1 ? p.dirtDark : s === 2 ? p.dirtLight : p.dirt;
  };

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // 草地頂
      const grassDepth = 4 + ((x * 3) % 3 === 0 ? 1 : 0);
      px(TILE.grassTop, x, y, y === 0 ? p.topDark : y < grassDepth ? p.top : y === grassDepth ? p.topDark : dirtAt(x, y));
      // 泥土
      px(TILE.dirt, x, y, dirtAt(x, y));
      px(TILE.dirtUnderSlope, x, y, dirtAt(x + 3, y));
      // 上坡：左下到右上的對角線以下
      const d1 = y - (GRID - 1 - x);
      if (d1 >= 0) px(TILE.slopeUp, x, y, d1 === 0 ? p.topDark : d1 < 4 ? p.top : dirtAt(x, y));
      // 下坡：左上到右下
      const d2 = y - x;
      if (d2 >= 0) px(TILE.slopeDown, x, y, d2 === 0 ? p.topDark : d2 < 4 ? p.top : dirtAt(x, y));
      // 木板（上半部）
      if (y < 6) px(TILE.plank, x, y, y === 0 || y === 5 || x % 8 === 7 ? p.woodDark : p.wood);
      // 繩索
      if (x >= 7 && x <= 8) px(TILE.rope, x, y, y % 4 === 0 ? p.woodDark : p.rope);
      // 梯子
      if (x === 3 || x === 12 || (x > 3 && x < 12 && y % 5 === 2)) px(TILE.ladder, x, y, x === 3 || x === 12 ? p.woodDark : p.wood);
    }
  }

  // 花
  for (let y = 9; y < GRID; y++) px(TILE.flower, 7, y, p.topDark);
  for (const [x, y] of [[6, 7], [8, 7], [7, 6], [7, 8], [7, 7]] as const) px(TILE.flower, x, y, x === 7 && y === 7 ? p.accent : p.accent2);
  // 草叢
  for (let x = 2; x < 14; x += 2) for (let y = 16 - 3 - (x % 4); y < GRID; y++) px(TILE.grass, x, y, y < 12 ? p.top : p.topDark);
  // 石頭
  for (let y = 10; y < GRID; y++) for (let x = 3; x < 13; x++) {
    const edge = y === 10 || x === 3 || x === 12 || y === GRID - 1;
    if (!(y === 10 && (x === 3 || x === 12))) px(TILE.rock, x, y, edge ? p.dirtDark : p.dirtLight);
  }
  // 燈柱
  for (let y = 4; y < GRID; y++) px(TILE.lamp, 7, y, p.woodDark);
  for (let y = 1; y < 5; y++) for (let x = 5; x < 10; x++) px(TILE.lamp, x, y, y === 1 || x === 5 || x === 9 ? p.woodDark : p.accent);
  // 灌木
  for (let y = 4; y < GRID; y++) for (let x = 1; x < 15; x++) {
    const dx = x - 7.5;
    const dy = y - 10;
    const r = dx * dx / 49 + dy * dy / 36;
    if (r <= 1) px(TILE.bush, x, y, r > 0.75 ? p.topDark : (x + y) % 5 === 0 ? p.accent : p.top);
  }
  // 水晶
  for (let y = 2; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const w = y < 9 ? y - 2 : GRID - y;
    if (Math.abs(x - 7.5) <= w / 2) px(TILE.crystal, x, y, Math.abs(x - 7.5) > w / 2 - 1 ? p.accent2 : p.accent);
  }
  return bmp;
}
