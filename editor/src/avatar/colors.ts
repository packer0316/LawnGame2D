/**
 * 換色規格檢查（STUDIO_SPEC §4.5、§4.6）：Key 色階只能用在需要換色的地方，
 * 圖中「很接近 Key 色、但不完全相同」的顏色多半是畫錯（例如用了吸管以外的顏色），換色時不會被替換。
 */

export const hexToInt = (hex: string) => Number.parseInt(hex.slice(1, 7), 16);
export const intToHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function dist(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export interface NearKeyColor {
  color: string;
  key: string;
  pixels: number;
}

/**
 * 找出接近 Key 色但不相等的顏色。pixels 是 RGBA（ImageData.data）。
 * threshold 是 RGB 歐氏距離，預設 12（肉眼幾乎分不出來的差距）。
 */
export function findNearKeyColors(pixels: Uint8ClampedArray | Uint8Array, keys: string[], threshold = 12): NearKeyColor[] {
  const keyInts = keys.map(hexToInt);
  const exact = new Set(keyInts);
  const counts = new Map<number, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const c = (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!;
    if (exact.has(c)) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const result: NearKeyColor[] = [];
  for (const [c, n] of counts) {
    let best: { key: number; d: number } | null = null;
    for (const k of keyInts) {
      const d = dist(c, k);
      if (d > 0 && d <= threshold && (!best || d < best.d)) best = { key: k, d };
    }
    if (best) result.push({ color: intToHex(c), key: intToHex(best.key), pixels: n });
  }
  return result.sort((a, b) => b.pixels - a.pixels);
}

/** 圖中用到的 Key 色（某群組）。沒有設定換色群組的部件若用了別的群組的 Key 色，換色時也會被誤換。 */
export function usedKeyColors(pixels: Uint8ClampedArray | Uint8Array, keys: string[]): string[] {
  const keyInts = new Set(keys.map(hexToInt));
  const used = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const c = (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!;
    if (keyInts.has(c)) used.add(c);
  }
  return [...used].map(intToHex);
}
