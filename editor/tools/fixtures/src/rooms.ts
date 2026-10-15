import { TILE } from './ldtkBuilder';
import type { LightSpec, RoomSpec, SpawnZoneSpec } from './ldtkBuilder';
import { battlePlatforms, roomWidth, sectionCount, sectionLayout } from './platformLayouts';
import landmarks from '../../../../game/assets/landmarks/catalog.json';

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

export function themeOfRoom(roomId: number, scenic = false): ThemeInfo {
  const base = THEMES[roomId <= 7 ? 0 : roomId <= 14 ? 1 : 2]!;
  const scene = scenic ? landmarks.scenes.find(s => s.roomIds.includes(roomId)) : undefined;
  return scene ? { ...base, theme: scene.themeId, tileset: scene.id, light: {...base.light,color:scene.light,intensity:0.85,flicker:0.05} } : base;
}

const HEIGHT = 34;

/** 依房號產生房間：寬幅階地、三層戰鬥平台、繩梯、傳送點、生怪區、光源。 */
export function generateRoom(roomId: number, scenic = false): RoomSpec {
  const r = rng(roomId * 7919);
  const info = themeOfRoom(roomId, scenic);
  // 滿版且看得到頭尾：每房 1440px（SPEC §4.1）
  const W = roomWidth(roomId);
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

  // 寬幅階地：固定構圖控制高地、谷地與入口，連續斜坡銜接，避免隨機的小凸塊。
  // 數值是相對基底的抬升格數；每一段都有足夠長的平地供群怪與範圍技能使用。
  const terrainProfiles = [
    [0, 3, 1, 4, 0], // 雙丘與中央淺谷
    [0, 2, 4, 2, 0], // 中央高地
    [0, 4, 0, 3, 0], // 兩岸與深谷
    [0, 4, 3, 1, 0], // 向右下降的梯田
    [0, 1, 3, 4, 0], // 向右上升的梯田
    [0, 3, 0, 4, 0], // 非對稱谷地
  ];
  // 寬地圖切成幾個區段，每段一種地形輪廓（跟該段的平台構圖一致），區段交界回到基準高度
  const sections = sectionCount(W);
  const groundTop: number[] = new Array(W).fill(H - 4);
  let top = H - 4;
  for (let cx = 1; cx < W - 1; cx++) {
    const s = Math.min(sections - 1, Math.floor((cx / W) * sections));
    const profile = terrainProfiles[sectionLayout(roomId, s)]!;
    const fraction = (cx / W) * sections - s;
    const segment = fraction < 0.20 ? 0 : fraction < 0.40 ? 1 : fraction < 0.65 ? 2 : fraction < 0.82 ? 3 : 4;
    const target = H - 4 - profile[segment]!;
    if (target !== top) {
      if (target < top) {
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

  const surface = (cx: number) => groundTop[cx]!;
  const spawnZones: SpawnZoneSpec[] = [];
  const pool = () => info.mobs.slice(0, r.int(2, info.mobs.length));

  // 每房皆為地面＋中層＋上層，小平台僅作銜接。
  const platforms = battlePlatforms(roomId, W, groundTop);
  for (const p of platforms) for (let cx = p.x0; cx < p.x0 + p.len; cx++) set(cx, p.row, p.solid ? '#' : '=');
  // 主平台都有繩梯路線；大平台兩端皆可上下，不依賴超過跳高的跳躍。
  for (const p of platforms) {
    if (p.role !== 'main') continue;
    const anchors = p.len >= 30 ? [p.x0 + 3, p.x0 + p.len - 4] : [p.x0 + Math.floor(p.len / 2)];
    for (const [i, cx] of anchors.entries()) {
      let cy = p.row + 1;
      while (cy < H && get(cx, cy) === '.') set(cx, cy++, i % 2 === 0 ? 'H' : '|');
    }
  }
  // 以房間寬度決定上層總生怪預算，按主平台長度分配，避免放大平台就無限制加怪。
  const arenas = platforms.filter((p) => p.role === 'main');
  let remaining = Math.floor(W / 6);
  let remainingLength = arenas.reduce((sum, p) => sum + p.len, 0);
  for (const [i, p] of arenas.entries()) {
    const maxCount = i === arenas.length - 1 ? remaining : Math.max(2, Math.round(remaining * p.len / remainingLength));
    spawnZones.push({ rect: [p.x0 + 1, p.row - 4, p.len - 2, 4], mobs: pool(), maxCount, respawnSec: 6 });
    remaining -= maxCount;
    remainingLength -= p.len;
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
  // 平台光源最多 8 盞（遊戲同時最多 16 盞光，留給角色與技能）
  for (const p of platforms) if (lights.length < 10 && r.chance(0.5)) lights.push({ cx: p.x0 + Math.floor(p.len / 2), cy: p.row - 2, ...info.light });

  // 裝飾
  const decorBack: [number, number, number][] = [];
  const decorFront: [number, number, number][] = [];
  for (let cx = 1; cx < W - 1; cx++) {
    const cy = surface(cx) - 1;
    if (get(cx, cy) !== '.' || get(cx, cy + 1) !== '#') continue;
    if (r.chance(0.18)) decorBack.push([cx, cy, info.decorBack[r.int(0, info.decorBack.length - 1)]!]);
    else if (r.chance(0.05)) decorFront.push([cx, cy, info.decorFront[r.int(0, info.decorFront.length - 1)]!]);
  }
  // 每個主戰鬥層都有少量主題裝飾，沿台緣放置並避開繩梯出口。
  for (const p of arenas) {
    for (let cx = p.x0 + 6; cx < p.x0 + p.len - 4; cx += 11) {
      decorBack.push([cx, p.row - 1, info.decorBack[r.int(0, info.decorBack.length - 1)]!]);
    }
  }
  // 入口平地保留固定前景細節，避免部分種子完全沒有前景層。
  decorFront.push([9, surface(9) - 1, info.decorFront[0]!]);

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
