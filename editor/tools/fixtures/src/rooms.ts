import { TILE } from './ldtkBuilder';
import type { LightSpec, RoomSpec, SpawnZoneSpec } from './ldtkBuilder';

/** 可重現的亂數（mulberry32）。 */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
  };
}

interface ThemeInfo {
  theme: string;
  tileset: string;
  bgm: string;
  mobs: string[];
  boss: string;
  light: Omit<LightSpec, 'cx' | 'cy'>;
  decorBack: number[];
  decorFront: number[];
}

const THEMES: ThemeInfo[] = [
  {
    theme: 'theme_0001', tileset: 'forest', bgm: 'bgm_forest',
    mobs: ['mob_0001:3', 'mob_0002:2', 'mob_0003:1'], boss: 'mob_0006',
    light: { color: '#ffe9a8', radius: 96, intensity: 0.8, flicker: 0 },
    decorBack: [TILE.flower, TILE.grass, TILE.grass, TILE.rock], decorFront: [TILE.bush],
  },
  {
    theme: 'theme_0002', tileset: 'cave', bgm: 'bgm_cave',
    mobs: ['mob_0003:2', 'mob_0004:3', 'mob_0005:1'], boss: 'mob_0006',
    light: { color: '#6fe0ff', radius: 128, intensity: 1.2, flicker: 0.1 },
    decorBack: [TILE.crystal, TILE.rock, TILE.rock], decorFront: [TILE.rock],
  },
  {
    theme: 'theme_0003', tileset: 'ruins', bgm: 'bgm_ruins',
    mobs: ['mob_0004:2', 'mob_0005:2', 'mob_0003:1'], boss: 'mob_0006',
    light: { color: '#ffb14a', radius: 112, intensity: 1, flicker: 0.35 },
    decorBack: [TILE.lamp, TILE.rock, TILE.grass], decorFront: [TILE.grass],
  },
];

export function themeOfRoom(roomId: number): ThemeInfo {
  return THEMES[roomId <= 7 ? 0 : roomId <= 14 ? 1 : 2]!;
}

const HEIGHT = 34;

/** 依房號產生一個測試房間：起伏地面（含斜坡）、單向平台與懸空實地、繩梯、傳送點、生怪區、光源。 */
export function generateRoom(roomId: number): RoomSpec {
  const r = rng(roomId * 7919);
  const info = themeOfRoom(roomId);
  const W = 60 + (roomId % 4) * 15;
  const H = HEIGHT;
  const g: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const set = (cx: number, cy: number, ch: string) => {
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) g[cy]![cx] = ch;
  };
  const get = (cx: number, cy: number) => g[cy]?.[cx] ?? '#';

  // 左右邊牆
  for (let cy = 0; cy < H; cy++) {
    set(0, cy, '#');
    set(W - 1, cy, '#');
  }

  // 起伏地面
  const groundTop: number[] = new Array(W).fill(H - 4);
  let top = H - 4;
  let cooldown = 0;
  for (let cx = 1; cx < W - 1; cx++) {
    cooldown--;
    const canSlope = cx >= 12 && cx <= W - 13 && cooldown <= 0;
    if (canSlope && r.chance(0.14)) {
      const up = top >= H - 4 ? true : top <= H - 9 ? false : r.chance(0.5);
      cooldown = r.int(4, 8);
      if (up) {
        set(cx, top - 1, '/');
        for (let cy = top; cy < H; cy++) set(cx, cy, '#');
        groundTop[cx] = top - 1;
        top -= 1;
      } else {
        set(cx, top, '\\');
        for (let cy = top + 1; cy < H; cy++) set(cx, cy, '#');
        groundTop[cx] = top;
        top += 1;
      }
      continue;
    }
    for (let cy = top; cy < H; cy++) set(cx, cy, '#');
    groundTop[cx] = top;
  }
  // 高台：一段突起的實地（產生牆與落差）
  if (r.chance(0.6)) {
    const x0 = r.int(14, W - 24);
    const len = r.int(4, 7);
    if ([...Array(len + 2).keys()].every((i) => !'/\\'.includes(get(x0 - 1 + i, groundTop[x0 - 1 + i]!)))) {
      for (let cx = x0; cx < x0 + len; cx++) {
        const t = groundTop[cx]!;
        for (let k = 1; k <= 2; k++) set(cx, t - k, '#');
        groundTop[cx] = t - 2;
      }
    }
  }

  const surface = (cx: number) => groundTop[cx]!;
  const spawnZones: SpawnZoneSpec[] = [];
  const pool = () => info.mobs.slice(0, r.int(2, info.mobs.length));

  // 平台
  const platforms: { x0: number; len: number; row: number; solid: boolean }[] = [];
  const count = r.int(3, 5);
  for (let i = 0, tries = 0; i < count && tries < 60; tries++) {
    const len = r.int(5, 10);
    const x0 = r.int(6, W - 7 - len);
    const minTop = Math.min(...groundTop.slice(x0, x0 + len));
    const tier = r.chance(0.65) ? 1 : 2;
    const row = minTop - (tier === 1 ? 5 : 10);
    if (row < 6) continue;
    let free = true;
    for (let cy = row - 3; cy <= row + 2 && free; cy++)
      for (let cx = x0 - 2; cx < x0 + len + 2 && free; cx++) if (get(cx, cy) !== '.') free = false;
    if (!free) continue;
    const solid = tier === 2 && r.chance(0.4);
    for (let cx = x0; cx < x0 + len; cx++) set(cx, row, solid ? '#' : '=');
    platforms.push({ x0, len, row, solid });
    i++;
  }
  // 繩梯：從平台下方往下接到第一個非空的格子
  for (const p of platforms) {
    const cx = r.chance(0.5) ? p.x0 + 1 : p.x0 + p.len - 2;
    const ch = p.solid ? 'H' : r.chance(0.5) ? '|' : 'H';
    let cy = p.row + 1;
    while (cy < H && get(cx, cy) === '.') set(cx, cy++, ch);
    spawnZones.push({ rect: [p.x0, p.row - 3, p.len, 3], mobs: pool(), maxCount: Math.ceil(p.len / 3), respawnSec: 6 });
  }

  // 地面生怪區
  const gx0 = 9;
  const gx1 = W - 10;
  const ground = groundTop.slice(gx0, gx1);
  const gMin = Math.min(...ground);
  const gMax = Math.max(...ground);
  spawnZones.push({ rect: [gx0, gMin - 3, gx1 - gx0, gMax - gMin + 3], mobs: pool(), maxCount: Math.floor(W / 6), respawnSec: 4 });

  // 實體標記（放在平地上一格；該格被占用時往左右找）
  const mark = (cx: number, ch: string) => {
    for (const dx of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      const x = cx + dx;
      if (x < 1 || x > W - 2) continue;
      const cy = surface(x) - 1;
      if (get(x, cy) === '.' && get(x, cy + 1) === '#') {
        set(x, cy, ch);
        return;
      }
    }
    throw new Error(`Room ${roomId}：找不到放 ${ch} 的平地`);
  };
  mark(2, 'W');
  mark(3, 'P');
  mark(6, 'S');
  mark(W - 4, 'N');
  mark(W - 3, 'W');
  const bossMobId = roomId % 5 === 0 ? info.boss : undefined;
  if (bossMobId) mark(Math.floor(W / 2), 'B');
  const toRoom = roomId % 4 === 0 ? ((roomId + 9) % 20) + 1 : undefined;
  if (toRoom) mark(Math.floor(W / 2) + 4, 'T');

  // 光源
  const lights: LightSpec[] = [
    { cx: 3, cy: surface(3) - 3, ...info.light },
    { cx: W - 4, cy: surface(W - 4) - 3, ...info.light },
  ];
  for (const p of platforms) if (r.chance(0.5)) lights.push({ cx: p.x0 + Math.floor(p.len / 2), cy: p.row - 2, ...info.light });

  // 裝飾
  const decorBack: [number, number, number][] = [];
  const decorFront: [number, number, number][] = [];
  for (let cx = 1; cx < W - 1; cx++) {
    const cy = surface(cx) - 1;
    if (get(cx, cy) !== '.' || get(cx, cy + 1) !== '#') continue;
    if (r.chance(0.18)) decorBack.push([cx, cy, info.decorBack[r.int(0, info.decorBack.length - 1)]!]);
    else if (r.chance(0.05)) decorFront.push([cx, cy, info.decorFront[r.int(0, info.decorFront.length - 1)]!]);
  }

  return {
    roomId,
    theme: info.theme,
    tileset: info.tileset,
    bgm: info.bgm,
    rows: g.map((row) => row.join('')),
    spawnZones,
    lights,
    ...(bossMobId ? { bossMobId } : {}),
    ...(toRoom ? { toRoom } : {}),
    decorBack,
    decorFront,
  };
}
