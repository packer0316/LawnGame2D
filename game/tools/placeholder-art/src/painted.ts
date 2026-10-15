import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Canvas } from './raster';

/** 原畫與輸出的圖集分開保存；重建素材時不需要再次呼叫圖片生成服務。 */
export const artDirectory = fileURLToPath(new URL('../../../assets/verdant/', import.meta.url));

export function readPainting(name: string): Canvas {
  const png = PNG.sync.read(fs.readFileSync(`${artDirectory}${name}.png`));
  const canvas = new Canvas(png.width, png.height);
  canvas.data.set(png.data);
  return canvas;
}

let creatures: Canvas[][] | undefined;

function creatureFrames(): Canvas[][] {
  if (creatures) return creatures;
  const atlas = readPainting('monsters');
  // 原畫列間保留透明空隙，最後一列樹精比其他怪物高。
  const rows = [0, 248, 488, 712, 970, 1194, 1536];
  creatures = Array.from({ length: 6 }, (_, row) => Array.from({ length: 4 }, (_, column) => {
    const cell = atlas.crop(column * 256, rows[row]!, 256, rows[row + 1]! - rows[row]!);
    // 忽略生成圖邊緣極淡的 alpha 雜訊，保留主體的半透明反光。
    for (let p = 3; p < cell.data.length; p += 4) if (cell.data[p]! < 40) cell.data[p] = 0;
    const box = cell.bounds();
    return box ? cell.crop(box.x, box.y, box.w, box.h) : cell;
  }));
  return creatures;
}

/** 將四張原畫編入既有動作時間軸；受擊、死亡、出現仍有獨立的逐幀演出。 */
export function paintCreature(target: Canvas, row: number, action: string, i: number, t: number): void {
  const frames = creatureFrames()[row]!;
  const pose = action === 'move' ? [0, 1, 2, 2, 3, 0, 3, 2][i % 8]! : action === 'hit' ? 1 : action === 'idle' ? [0, 0, 3, 0, 0, 3][i % 6]! : 0;
  const source = frames[pose]!;
  const maxW = Math.max(...frames.map((f) => f.width));
  const maxH = Math.max(...frames.map((f) => f.height));
  const scale = Math.min((target.width - 5) / maxW, (target.height - 3) / maxH);
  const death = action === 'die' ? t : 0;
  const appear = action === 'appear' ? t : 1;
  const w = Math.max(1, Math.round(source.width * scale * (1 + death * 0.18)));
  const h = Math.max(1, Math.round(source.height * scale * (1 - death * 0.8)));
  const lift = action === 'move' && (pose === 2 || pose === 3) ? 2 : 0;
  const ox = Math.round((target.width - w) / 2);
  const oy = target.height - h - 1 - lift + Math.round((1 - appear) * h);
  stampPainting(target, source, ox, oy, w, h, death);
}

function stampPainting(target: Canvas, source: Canvas, ox: number, oy: number, w: number, h: number, death = 0): void {
  // 面積採樣保留小尺寸的臉、材質與輪廓；透明區域不會混入黑邊。
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(y * source.height / h); sy < Math.ceil((y + 1) * source.height / h); sy++) {
      for (let sx = Math.floor(x * source.width / w); sx < Math.ceil((x + 1) * source.width / w); sx++) {
        const p = source.get(sx, sy); r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3]; n++;
      }
    }
    if (!a || (death > 0.3 && ((x * 13 + y * 7) % 17) / 17 < death - 0.3)) continue;
    target.set(ox + x, oy + y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n * (1 - death * 0.65))]);
  }
}

let heroes: Canvas[] | undefined;

/** 完整造型仍透過既有 overall 部件載入，武器依職業獨立疊圖，不更動紙娃娃介面。 */
export function paintHero(target: Canvas, action: string, i: number): void {
  if (!heroes) {
    const atlas = readPainting('hero');
    const rows = [0, 310, 615, 913, atlas.height];
    heroes = Array.from({ length: 16 }, (_, n) => {
      const row = Math.floor(n / 4), col = n % 4;
      const x = Math.round(col * atlas.width / 4);
      const cell = atlas.crop(x, rows[row]!, Math.round((col + 1) * atlas.width / 4) - x, rows[row + 1]! - rows[row]!);
      for (let p = 3; p < cell.data.length; p += 4) if (cell.data[p]! < 40) cell.data[p] = 0;
      const box = cell.bounds();
      return box ? cell.crop(box.x, box.y, box.w, box.h) : cell;
    });
  }
  const sequences: Record<string, number[]> = {
    stand: [0, 0, 0, 0, 0, 0], run: [1, 1, 2, 2, 3, 3, 2, 2],
    jump: [4, 4], fall: [5, 5], land: [6, 0], roll: [6, 7, 7, 7, 6, 0], prone: [7],
    ladder: [14, 14, 15, 15], rope: [14, 14, 15, 15],
    swing1: [0, 8, 9, 10, 0], swing2: [10, 8, 9, 10, 0], swing3: [8, 8, 9, 10, 0],
    cast: [0, 11, 11, 11, 11, 0], shoot: [0, 12, 12, 12, 12, 0], throw: [0, 13, 13, 13, 0],
  };
  const source = heroes[sequences[action]?.[i] ?? 0]!;
  const scale = 62 / heroes[0]!.height;
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  const bob = action === 'stand' && i > 1 && i < 5 ? 1 : 0;
  stampPainting(target, source, Math.round(64 - w * 0.42), 120 - h + bob, w, h);
}
