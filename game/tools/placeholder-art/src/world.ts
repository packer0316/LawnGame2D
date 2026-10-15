import { buildNavGraph, type Ceiling, type Climbable, type Foothold, type MapDef, type MapLight, type RoomFile, type ThemeFile, type Wall } from '@lawn/shared';
import { Canvas, hex, shade, type RGBA } from './raster';
import { writeJson, writePng } from './sheet';
import { readPainting } from './painted';

const T = 16;

// ---------------------------------------------------------------------------
// 格子地圖（規則同 STUDIO_SPEC §6.4 的 LDtk 轉換）
// ---------------------------------------------------------------------------

/** '.' 空、'#' 實地、'=' 單向平台、'/' 上坡（左低右高）、'\' 下坡、'H' 梯子、'|' 繩索 */
type Cell = '.' | '#' | '=' | '/' | '\\' | 'H' | '|';

class Grid {
  readonly cells: Cell[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array<Cell>(w * h).fill('.');
  }
  get(x: number, y: number): Cell | null {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.cells[y * this.w + x]!;
  }
  set(x: number, y: number, cell: Cell): void {
    if (this.get(x, y) !== null) this.cells[y * this.w + x] = cell;
  }
  fill(x0: number, y0: number, x1: number, y1: number, cell: Cell): this {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) this.set(x, y, cell);
    return this;
  }
  /** 上坡：從 (x, y) 往右上走 n 格，坡下補實地到 bottom。 */
  slopeUp(x: number, y: number, n: number, bottom: number): this {
    for (let k = 0; k < n; k += 1) {
      this.set(x + k, y - k, '/');
      this.fill(x + k, y - k + 1, x + k, bottom, '#');
    }
    return this;
  }
  slopeDown(x: number, y: number, n: number, bottom: number): this {
    for (let k = 0; k < n; k += 1) {
      this.set(x + k, y + k, '\\');
      this.fill(x + k, y + k + 1, x + k, bottom, '#');
    }
    return this;
  }
  column(x: number, y0: number, y1: number, cell: 'H' | '|'): this {
    for (let y = y0; y <= y1; y += 1) if (this.get(x, y) === '.') this.set(x, y, cell);
    return this;
  }
}

type Edges = { top: boolean; bottom: boolean; left: boolean; right: boolean };
const NONE: Edges = { top: false, bottom: false, left: false, right: false };
function edges(cell: Cell | null): Edges {
  switch (cell) {
    case null:
      return { top: true, bottom: true, left: true, right: true }; // 地圖外視為實心，不產生邊界牆
    case '#':
      return { top: true, bottom: true, left: true, right: true };
    case '/':
      return { top: false, bottom: true, left: false, right: true };
    case '\\':
      return { top: false, bottom: true, left: true, right: false };
    default:
      return NONE;
  }
}
const isGround = (cell: Cell | null) => cell === '#' || cell === '/' || cell === '\\';

function footholdsOf(grid: Grid): Foothold[] {
  type Seg = { a: [number, number]; b: [number, number]; oneWay: boolean };
  const segs: Seg[] = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const cell = grid.get(x, y);
      const above = grid.get(x, y - 1);
      // 地圖上緣以外視為實心：最上排實地的頂邊不是可站立的地面
      if (cell === '#' && above !== null && !isGround(above)) segs.push({ a: [x * T, y * T], b: [(x + 1) * T, y * T], oneWay: false });
      if (cell === '=') segs.push({ a: [x * T, y * T], b: [(x + 1) * T, y * T], oneWay: true });
      if (cell === '/') segs.push({ a: [x * T, (y + 1) * T], b: [(x + 1) * T, y * T], oneWay: false });
      if (cell === '\\') segs.push({ a: [x * T, y * T], b: [(x + 1) * T, (y + 1) * T], oneWay: false });
    }
  }
  const key = (p: [number, number], oneWay: boolean) => `${p[0]},${p[1]},${oneWay}`;
  const byStart = new Map(segs.map((s) => [key(s.a, s.oneWay), s]));
  const ends = new Set(segs.map((s) => key(s.b, s.oneWay)));
  const used = new Set<Seg>();
  const result: Foothold[] = [];
  for (const seg of [...segs].sort((p, q) => p.a[0] - q.a[0])) {
    if (used.has(seg) || ends.has(key(seg.a, seg.oneWay))) continue;
    const points: [number, number][] = [seg.a, seg.b];
    used.add(seg);
    let next = byStart.get(key(seg.b, seg.oneWay));
    while (next && !used.has(next)) {
      used.add(next);
      points.push(next.b);
      next = byStart.get(key(next.b, next.oneWay));
    }
    // 共線的點合併
    const merged: [number, number][] = [points[0]!];
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i]!;
      const last = merged.at(-1)!;
      const prev = merged.at(-2);
      if (prev && (last[0] - prev[0]) * (p[1] - last[1]) === (last[1] - prev[1]) * (p[0] - last[0])) merged[merged.length - 1] = p;
      else merged.push(p);
    }
    result.push({ id: result.length + 1, points: merged, oneWay: seg.oneWay });
  }
  return result;
}

function wallsOf(grid: Grid): Wall[] {
  type Run = { x: number; y0: number; y1: number; side: -1 | 1 };
  const runs: Run[] = [];
  for (let x = 0; x <= grid.w; x += 1) {
    for (const side of [1, -1] as const) {
      let open: Run | null = null;
      for (let y = 0; y < grid.h; y += 1) {
        // side = 1：實心在牆右邊 = 格子 (x, y) 的左邊是實心、左鄰的右邊不是
        const solid = side === 1 ? edges(grid.get(x, y)).left && grid.get(x, y) !== null && !edges(grid.get(x - 1, y)).right : edges(grid.get(x - 1, y)).right && grid.get(x - 1, y) !== null && !edges(grid.get(x, y)).left;
        if (solid) {
          if (open) open.y1 = y;
          else open = { x, y0: y, y1: y, side };
        } else if (open) {
          runs.push(open);
          open = null;
        }
      }
      if (open) runs.push(open);
    }
  }
  return runs.map((r, i) => ({ id: i + 1, x: r.x * T, yTop: r.y0 * T, yBottom: (r.y1 + 1) * T, side: r.side }));
}

function ceilingsOf(grid: Grid): Ceiling[] {
  const result: Ceiling[] = [];
  for (let y = 0; y < grid.h; y += 1) {
    let start = -1;
    for (let x = 0; x <= grid.w; x += 1) {
      const cell = grid.get(x, y);
      const solid = x < grid.w && cell !== null && edges(cell).bottom && !edges(grid.get(x, y + 1)).top;
      if (solid && start < 0) start = x;
      if (!solid && start >= 0) {
        result.push({ id: result.length + 1, y: (y + 1) * T, x1: start * T, x2: x * T });
        start = -1;
      }
    }
  }
  return result;
}

function climbablesOf(grid: Grid): Climbable[] {
  const result: Climbable[] = [];
  for (let x = 0; x < grid.w; x += 1) {
    let start = -1;
    let type: 'H' | '|' = 'H';
    for (let y = 0; y <= grid.h; y += 1) {
      const cell = grid.get(x, y);
      const hit = cell === 'H' || cell === '|';
      if (hit && (start < 0 || cell !== type)) {
        if (start >= 0) result.push({ id: result.length + 1, type: type === 'H' ? 'ladder' : 'rope', x: x * T + T / 2, yTop: start * T, yBottom: y * T });
        start = y;
        type = cell;
      }
      if (!hit && start >= 0) {
        result.push({ id: result.length + 1, type: type === 'H' ? 'ladder' : 'rope', x: x * T + T / 2, yTop: start * T, yBottom: y * T });
        start = -1;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tileset（8 欄）
// ---------------------------------------------------------------------------

const TILE = {
  grassMid: 1,
  grassLeft: 2,
  grassRight: 3,
  grassSingle: 4,
  dirt: 5,
  dirtLeft: 6,
  dirtRight: 7,
  dirtBottom: 8,
  slopeUp: 9,
  slopeDown: 10,
  platLeft: 11,
  platMid: 12,
  platRight: 13,
  ladder: 14,
  rope: 15,
  dirtStones: 16,
  slopeUpFill: 17,
  slopeDownFill: 18,
} as const;

function autotile(grid: Grid, x: number, y: number): number | null {
  const cell = grid.get(x, y);
  const ground = (dx: number, dy: number) => {
    const c = grid.get(x + dx, y + dy);
    return c === null || isGround(c);
  };
  switch (cell) {
    case '#': {
      if (!ground(0, -1)) {
        const l = ground(-1, 0);
        const r = ground(1, 0);
        if (!l && !r) return TILE.grassSingle;
        if (!l) return TILE.grassLeft;
        if (!r) return TILE.grassRight;
        return TILE.grassMid;
      }
      const above = grid.get(x, y - 1);
      if (above === '/') return TILE.slopeUpFill;
      if (above === '\\') return TILE.slopeDownFill;
      if (!ground(0, 1)) return TILE.dirtBottom;
      if (!ground(-1, 0)) return TILE.dirtLeft;
      if (!ground(1, 0)) return TILE.dirtRight;
      return 32 + (y % 4) * 4 + x % 4;
    }
    case '/':
      return TILE.slopeUp;
    case '\\':
      return TILE.slopeDown;
    case '=':
      return grid.get(x - 1, y) !== '=' ? TILE.platLeft : grid.get(x + 1, y) !== '=' ? TILE.platRight : TILE.platMid;
    case 'H':
      return TILE.ladder;
    case '|':
      return TILE.rope;
    default:
      return null;
  }
}

interface ThemeColors {
  top: RGBA;
  topLight: RGBA;
  dirt: RGBA;
  dirtDark: RGBA;
  wood: RGBA;
}

function drawTileset(colors: ThemeColors): Canvas {
  const c = new Canvas(8 * T, 6 * T);
  const at = (id: number) => [(id % 8) * T, Math.floor(id / 8) * T] as const;
  // 64×64 的連續岩壁切成十六塊，避免每 16 像素重複的磚牆感。
  const rock = new Canvas(64, 64);
  const seeds = Array.from({ length: 22 }, (_, i) => ({ x: (i * 23 + 7) % 64, y: (i * 37 + 13) % 64, tone: 0.8 + (i % 5) * 0.07 }));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    let first = Infinity, second = Infinity, tone = 1, sy = 0;
    for (const seed of seeds) {
      let dx = x - seed.x, dy = y - seed.y;
      dx -= Math.round(dx / 64) * 64; dy -= Math.round(dy / 64) * 64;
      const distance = dx * dx + dy * dy * 0.8;
      if (distance < first) { second = first; first = distance; tone = seed.tone; sy = dy; }
      else if (distance < second) second = distance;
    }
    const edge = Math.sqrt(second) - Math.sqrt(first);
    const grain = ((x * 17 + y * 31) % 11) * 0.007;
    rock.set(x, y, edge < 0.65 ? colors.dirtDark : shade(colors.dirt, tone + grain + (edge < 1.8 && sy < 0 ? 0.21 : 0)));
  }
  for (let n = 0; n < 16; n++) {
    const [ox, oy] = at(32 + n);
    c.draw(rock.crop((n % 4) * T, Math.floor(n / 4) * T, T, T), ox, oy);
  }
  const dirtFill = (ox: number, oy: number, stones = false) => {
    c.draw(rock.crop(stones ? 16 : 0, stones ? 32 : 0, T, T), ox, oy);
    if (stones) { c.line(ox + 3, oy + 3, ox + 6, oy + 7, colors.dirtDark); c.set(ox + 11, oy + 10, colors.top); }
  };
  const grassTop = (ox: number, oy: number, left: boolean, right: boolean) => {
    dirtFill(ox, oy);
    c.fillRect(ox, oy, T, 3, colors.top);
    for (let px = 0; px < T; px++) {
      const fringe = 3 + ((px * 7 + 3) % 5);
      c.line(ox + px, oy + 2, ox + px, oy + fringe, shade(colors.top, 0.72));
      c.set(ox + px, oy, px % 4 === 0 ? colors.top : colors.topLight);
      if (px % 3 === 0) c.set(ox + px, oy + 2, shade(colors.topLight, 0.88));
    }
    if (left) c.fillRect(ox, oy, 1, T, shade(colors.dirtDark, 0.8));
    if (right) c.fillRect(ox + T - 1, oy, 1, T, shade(colors.dirtDark, 0.8));
  };
  {
    const [x, y] = at(TILE.grassMid);
    grassTop(x, y, false, false);
  }
  {
    const [x, y] = at(TILE.grassLeft);
    grassTop(x, y, true, false);
  }
  {
    const [x, y] = at(TILE.grassRight);
    grassTop(x, y, false, true);
  }
  {
    const [x, y] = at(TILE.grassSingle);
    grassTop(x, y, true, true);
  }
  {
    const [x, y] = at(TILE.dirt);
    dirtFill(x, y);
  }
  {
    const [x, y] = at(TILE.dirtStones);
    dirtFill(x, y, true);
  }
  {
    const [x, y] = at(TILE.dirtLeft);
    dirtFill(x, y);
    c.fillRect(x, y, 1, T, shade(colors.dirtDark, 0.8));
  }
  {
    const [x, y] = at(TILE.dirtRight);
    dirtFill(x, y);
    c.fillRect(x + T - 1, y, 1, T, shade(colors.dirtDark, 0.8));
  }
  {
    const [x, y] = at(TILE.dirtBottom);
    dirtFill(x, y);
    c.fillRect(x, y + T - 2, T, 2, shade(colors.dirtDark, 0.8));
  }
  for (const id of [TILE.slopeUp, TILE.slopeDown, TILE.slopeUpFill, TILE.slopeDownFill]) {
    const [x, y] = at(id);
    if (id === TILE.slopeUpFill || id === TILE.slopeDownFill) {
      dirtFill(x, y);
      continue;
    }
    const up = id === TILE.slopeUp;
    // 坡面以下是土，坡面上 4 像素是草
    for (let px = 0; px < T; px += 1) {
      const surface = up ? T - 1 - px : px;
      for (let py = surface; py < T; py += 1) {
        const depth = py - surface;
        c.set(x + px, y + py, depth < 4 ? (depth === 0 ? colors.topLight : colors.top) : (px * 5 + py * 3) % 11 === 0 ? colors.dirtDark : colors.dirt);
      }
    }
  }
  for (const id of [TILE.platLeft, TILE.platMid, TILE.platRight]) {
    const [x, y] = at(id);
    c.fillRect(x, y, T, 10, shade(colors.wood, 0.5));
    c.fillRect(x, y + 1, T, 7, colors.wood);
    c.fillRect(x, y, T, 2, colors.top);
    c.line(x, y, x + 15, y, colors.topLight);
    c.line(x + 1, y + 4, x + 12, y + 4, shade(colors.wood, 1.35));
    c.line(x + 4, y + 6, x + 15, y + 6, shade(colors.wood, 0.65));
    c.fillRect(x + 13, y + 2, 2, 7, hex('#384843'));
    c.set(x + 13, y + 3, hex('#cebd80'));
    if (id === TILE.platLeft) c.fillRect(x, y, 2, 6, shade(colors.wood, 0.6));
    if (id === TILE.platRight) c.fillRect(x + T - 2, y, 2, 6, shade(colors.wood, 0.6));
    c.line(x + 5, y + 10, x + 9, y + 15, shade(colors.top, 0.6));
    c.fillEllipse(x + 7, y + 12, 2, 1, colors.top);
  }
  {
    const [x, y] = at(TILE.ladder);
    c.fillRect(x + 3, y, 2, T, colors.wood);
    c.fillRect(x + 11, y, 2, T, colors.wood);
    c.fillRect(x + 3, y + 3, 10, 2, shade(colors.wood, 1.2));
    c.fillRect(x + 3, y + 11, 10, 2, shade(colors.wood, 1.2));
  }
  {
    const [x, y] = at(TILE.rope);
    for (let py = 0; py < T; py += 1) c.set(x + 7 + ((py >> 1) % 2), y + py, hex('#d8c08a'));
    for (let py = 0; py < T; py += 1) c.set(x + 8 - ((py >> 1) % 2), y + py, hex('#a88a52'));
  }
  return c;
}

/**
 * 從亮度推算高度，再用 Sobel 算法線（Laigter 的做法）。
 * tile > 0 時只在同一格圖塊內取樣，避免相鄰圖塊互相影響、在地圖上出現格線。
 */
export function normalMap(source: Canvas, strength = 2, tile = 0): Canvas {
  const out = new Canvas(source.width, source.height);
  let tx0 = 0;
  let ty0 = 0;
  const height = (x: number, y: number) => {
    const maxX = tile > 0 ? tx0 + tile - 1 : source.width - 1;
    const maxY = tile > 0 ? ty0 + tile - 1 : source.height - 1;
    const cx = Math.max(tx0, Math.min(maxX, x));
    const cy = Math.max(ty0, Math.min(maxY, y));
    const [r, g, b, a] = source.get(cx, cy);
    return a === 0 ? 0 : (r * 0.3 + g * 0.59 + b * 0.11) / 255;
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const a = source.get(x, y)[3];
      if (a === 0) continue;
      if (tile > 0) {
        tx0 = Math.floor(x / tile) * tile;
        ty0 = Math.floor(y / tile) * tile;
      }
      const dx = (height(x + 1, y - 1) + 2 * height(x + 1, y) + height(x + 1, y + 1) - height(x - 1, y - 1) - 2 * height(x - 1, y) - height(x - 1, y + 1)) * strength;
      const dy = (height(x - 1, y + 1) + 2 * height(x, y + 1) + height(x + 1, y + 1) - height(x - 1, y - 1) - 2 * height(x, y - 1) - height(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      out.set(x, y, [Math.round(((-dx / len) * 0.5 + 0.5) * 255), Math.round(((dy / len) * 0.5 + 0.5) * 255), Math.round(((1 / len) * 0.5 + 0.5) * 255), a]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 背景
// ---------------------------------------------------------------------------

interface MapPlan {
  id: string;
  name: string;
  theme: string;
  tileset: string;
  grid: Grid;
  portals: MapDef['portals'];
  spawnZones: { id: string; rect: [number, number, number, number]; maxCount: number; pool: [string, number][] }[];
  lights: MapLight[];
  waveEntries: MapDef['waveEntries'];
  boss?: MapDef['boss'];
}

function forestPlan(): MapPlan {
  const g = new Grid(140, 40);
  g.fill(0, 34, 139, 39, '#');
  g.slopeUp(40, 33, 4, 39).fill(44, 30, 60, 39, '#').slopeDown(61, 30, 4, 39);
  g.fill(10, 26, 24, 26, '=').column(17, 27, 33, 'H');
  g.fill(30, 20, 46, 20, '=').column(38, 21, 29, '|');
  g.fill(70, 26, 90, 26, '=').column(80, 27, 33, '|');
  g.fill(95, 18, 115, 18, '=').column(105, 19, 33, 'H');
  g.fill(120, 24, 135, 24, '=');
  g.fill(100, 28, 103, 33, '#');
  // 浮空方塊：從中層平台右端跳得上去，下方可以測試撞頭
  g.fill(93, 21, 98, 22, '#');
  return {
    id: 'map_0001',
    name: '晨霧之森',
    theme: 'theme_0001',
    tileset: 'forest',
    grid: g,
    portals: [
      { id: 'spawn', type: 'spawn', x: 6 * T, y: 34 * T },
      { id: 'prev', type: 'prev', x: 2 * T, y: 34 * T },
      { id: 'next', type: 'next', x: 137 * T, y: 34 * T },
    ],
    spawnZones: [
      { id: 'ground_left', rect: [4, 30, 34, 4], maxCount: 10, pool: [['mob_0001', 3], ['mob_0002', 2]] },
      { id: 'plateau', rect: [44, 26, 17, 4], maxCount: 6, pool: [['mob_0002', 2], ['mob_0005', 1]] },
      { id: 'mid_platform', rect: [70, 22, 21, 4], maxCount: 5, pool: [['mob_0001', 1]] },
      { id: 'high_platform', rect: [95, 14, 21, 4], maxCount: 5, pool: [['mob_0002', 1], ['mob_0003', 1]] },
      { id: 'ground_right', rect: [66, 30, 70, 4], maxCount: 12, pool: [['mob_0001', 3], ['mob_0002', 2], ['mob_0004', 1]] },
      { id: 'sky', rect: [50, 8, 60, 10], maxCount: 6, pool: [['mob_0003', 1]] },
    ],
    lights: [
      { x: 24 * T, y: 25 * T, color: '#ffb35c', radius: 90, intensity: 1.2, flicker: 0.15 },
      { x: 52 * T, y: 29 * T, color: '#ffb35c', radius: 90, intensity: 1.2, flicker: 0.15 },
      { x: 104 * T, y: 17 * T, color: '#8fd3ff', radius: 110, intensity: 1, flicker: 0 },
    ],
    waveEntries: [
      { x: 1 * T, y: 34 * T, dir: 1 },
      { x: 138 * T, y: 34 * T, dir: -1 },
    ],
    boss: { mobId: 'mob_0006', x: 90 * T, y: 34 * T, intervalSec: 180 },
  };
}

function cavePlan(): MapPlan {
  const g = new Grid(120, 44);
  g.fill(0, 0, 119, 3, '#');
  g.fill(0, 38, 119, 43, '#');
  g.fill(0, 4, 2, 37, '#').fill(117, 4, 119, 37, '#');
  g.fill(30, 34, 50, 37, '#').slopeUp(26, 37, 4, 43).slopeDown(51, 34, 4, 43);
  g.fill(8, 30, 22, 30, '=').column(15, 31, 37, '|');
  g.fill(58, 26, 80, 26, '=').column(70, 27, 37, 'H');
  g.fill(86, 20, 104, 20, '=').column(95, 21, 37, '|');
  // 高處平台由山丘上的繩子接上去，浮空岩塊從平台右端跳得上去
  g.fill(40, 16, 56, 16, '=').column(48, 17, 33, '|');
  g.fill(60, 13, 70, 14, '#');
  return {
    id: 'map_0002',
    name: '星螢秘窟',
    theme: 'theme_0002',
    tileset: 'cave',
    grid: g,
    portals: [
      { id: 'spawn', type: 'spawn', x: 6 * T, y: 38 * T },
      { id: 'prev', type: 'prev', x: 4 * T, y: 38 * T },
      { id: 'next', type: 'next', x: 114 * T, y: 38 * T },
    ],
    spawnZones: [
      { id: 'floor', rect: [4, 34, 112, 4], maxCount: 16, pool: [['mob_0001', 2], ['mob_0002', 2], ['mob_0005', 1]] },
      { id: 'hill', rect: [30, 30, 21, 4], maxCount: 5, pool: [['mob_0004', 1], ['mob_0002', 2]] },
      { id: 'mid', rect: [58, 22, 23, 4], maxCount: 6, pool: [['mob_0002', 1]] },
      { id: 'air', rect: [20, 8, 80, 12], maxCount: 8, pool: [['mob_0003', 1]] },
    ],
    lights: [
      { x: 12 * T, y: 29 * T, color: '#ff9a4a', radius: 110, intensity: 1.4, flicker: 0.25 },
      { x: 40 * T, y: 33 * T, color: '#5fd3ff', radius: 130, intensity: 1.3, flicker: 0 },
      { x: 69 * T, y: 25 * T, color: '#ff9a4a', radius: 110, intensity: 1.4, flicker: 0.25 },
      { x: 95 * T, y: 19 * T, color: '#b77bff', radius: 140, intensity: 1.3, flicker: 0.05 },
      { x: 112 * T, y: 36 * T, color: '#ff9a4a', radius: 100, intensity: 1.4, flicker: 0.25 },
    ],
    waveEntries: [
      { x: 4 * T, y: 38 * T, dir: 1 },
      { x: 115 * T, y: 38 * T, dir: -1 },
    ],
  };
}

function buildMap(plan: MapPlan): MapDef {
  const { grid } = plan;
  const tiles: [number, number, number, number][] = [];
  for (let y = 0; y < grid.h; y += 1) {
    for (let x = 0; x < grid.w; x += 1) {
      const id = autotile(grid, x, y);
      if (id !== null) tiles.push([x * T, y * T, id, 0]);
    }
  }
  const footholds = footholdsOf(grid);
  const walls = wallsOf(grid);
  const ceilings = ceilingsOf(grid);
  const climbables = climbablesOf(grid);
  const size = { w: grid.w * T, h: grid.h * T };
  // 足場任一線段與矩形相交（含邊界）就算在生怪區內（同編輯器的判定）。
  const touches = (rect: [number, number, number, number]) => {
    const [x0, y0, x1, y1] = [rect[0] * T, rect[1] * T, (rect[0] + rect[2]) * T, (rect[1] + rect[3]) * T];
    return footholds
      .filter((fh) =>
        fh.points.some((a, i) => {
          const b = fh.points[i + 1];
          if (!b) return false;
          const lo = Math.max(x0, a[0]);
          const hi = Math.min(x1, b[0]);
          if (lo > hi) return false;
          const yAt = (x: number) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
          return Math.max(yAt(lo), yAt(hi)) >= y0 && Math.min(yAt(lo), yAt(hi)) <= y1;
        }),
      )
      .map((fh) => fh.id);
  };
  return {
    schemaVersion: 1,
    id: plan.id,
    name: plan.name,
    theme: plan.theme,
    bgm: '',
    tileSize: 16,
    size,
    cameraBounds: { x: 0, y: 0, w: grid.w * T, h: grid.h * T },
    tileLayers: [{ name: 'Terrain', tileset: `tilesets/${plan.tileset}.png`, z: 'back', tiles }],
    decors: [],
    lights: plan.lights,
    footholds,
    walls,
    ceilings,
    climbables,
    portals: plan.portals,
    spawnZones: plan.spawnZones.map((zone) => ({
      id: zone.id,
      rect: { x: zone.rect[0] * T, y: zone.rect[1] * T, w: zone.rect[2] * T, h: zone.rect[3] * T },
      footholdIds: touches(zone.rect),
      maxCount: zone.maxCount,
      respawnSec: 4,
      pool: zone.pool.map(([mobId, weight]) => ({ mobId, weight })),
    })),
    waveEntries: plan.waveEntries,
    ...(plan.boss ? { boss: plan.boss } : {}),
    nav: buildNavGraph({ footholds, walls, ceilings, climbables, size }),
  };
}

export function writeWorld(contentDir: string): { mapIds: string[] } {
  const themes: Record<string, ThemeColors> = {
    forest: { top: hex('#548c68'), topLight: hex('#c0d78c'), dirt: hex('#465858'), dirtDark: hex('#263d40'), wood: hex('#6d6550') },
    cave: { top: hex('#497f89'), topLight: hex('#8bc9c6'), dirt: hex('#394760'), dirtDark: hex('#202e44'), wood: hex('#56576b') },
    ruins: { top: hex('#8e6fc4'), topLight: hex('#c9b0f0'), dirt: hex('#5a4b6e'), dirtDark: hex('#3a3049'), wood: hex('#8a6a4a') },
  };
  for (const [id, colors] of Object.entries(themes)) {
    const tileset = drawTileset(colors);
    writePng(`${contentDir}/tilesets/${id}.png`, tileset);
    writePng(`${contentDir}/tilesets/${id}_n.png`, normalMap(tileset, 1.5, T));
  }

  writePng(`${contentDir}/backgrounds/forest_painted.png`, readPainting('forest'));
  writePng(`${contentDir}/backgrounds/cave_painted.png`, readPainting('cave'));

  const themeFile: ThemeFile = {
    schemaVersion: 1,
    themes: [
      {
        id: 'theme_0001',
        ambient: { color: '#ffffff', intensity: 1 },
        tileset: { image: 'tilesets/forest.png', normal: 'tilesets/forest_n.png' },
        backgrounds: [{ image: 'backgrounds/forest_painted.png', rx: 0.08, ry: 0.03, tileX: false, tileY: false, y: 0 }],
      },
      {
        id: 'theme_0002',
        ambient: { color: '#c5d5f0', intensity: 0.74 },
        tileset: { image: 'tilesets/cave.png', normal: 'tilesets/cave_n.png' },
        backgrounds: [{ image: 'backgrounds/cave_painted.png', rx: 0.06, ry: 0.03, tileX: false, tileY: false, y: 0 }],
      },
      {
        id: 'theme_0003',
        ambient: { color: '#b49ad8', intensity: 0.6 },
        tileset: { image: 'tilesets/ruins.png', normal: 'tilesets/ruins_n.png' },
        backgrounds: [{ image: 'backgrounds/cave_painted.png', rx: 0.1, ry: 0.03, tileX: false, tileY: false, y: 0 }],
      },
    ],
  };
  writeJson(`${contentDir}/themes/themes.json`, themeFile);

  const maps = [buildMap(forestPlan()), buildMap(cavePlan())];
  for (const map of maps) writeJson(`${contentDir}/maps/${map.id}.json`, map);

  const rooms: RoomFile = {
    schemaVersion: 1,
    rooms: [
      { id: 1, mapId: 'map_0001', name: '晨霧之森', betRange: [1, 10000], lineup: ['mob_0001', 'mob_0002', 'mob_0003', 'mob_0004'], boss: { mobId: 'mob_0006', intervalSec: 180 } },
      { id: 2, mapId: 'map_0002', name: '星螢秘窟', betRange: [1, 10000], lineup: ['mob_0001', 'mob_0002', 'mob_0003', 'mob_0005'] },
    ],
  };
  writeJson(`${contentDir}/rooms/rooms.json`, rooms);

  return { mapIds: maps.map((m) => m.id) };
}
