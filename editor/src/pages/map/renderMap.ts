/** 地圖結構檢視的繪製（Canvas 2D）：圖塊、足場、牆、天花板、繩梯、實體、生怪區、光源、導航圖。 */
import { TILE_FLIP_X, TILE_FLIP_Y } from '@lawn/shared';
import type { MapDef } from '@lawn/shared';
import { footholdUnder, footholdYAt } from '../../map/geometry';
import type { MapLayers } from './mapStore';

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

export const COLORS = {
  foothold: '#5ad16a',
  oneWay: '#5ad1d1',
  wall: '#ff6b7a',
  ceiling: '#ff9f4a',
  climb: '#f2d64b',
  spawn: '#3bc45a',
  portal: '#5aa7e6',
  zone: '#e65a5a',
  light: '#ffe27a',
  wave: '#e6a15a',
  boss: '#b03ae6',
  nav: '#a58cff',
  select: '#ffffff',
};

/** 把圖塊層預先畫到離屏畫布（1:1），之後縮放只要畫一張圖。 */
export function prerenderTiles(
  map: MapDef,
  images: Map<string, CanvasImageSource & { width: number }>,
  z: 'back' | 'front',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.size.w;
  canvas.height = map.size.h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const g = map.tileSize;
  const drawTile = (img: CanvasImageSource & { width: number }, tileId: number, x: number, y: number, flip: number) => {
    const cols = Math.max(1, Math.floor(img.width / g));
    const sx = (tileId % cols) * g;
    const sy = Math.floor(tileId / cols) * g;
    if (flip === 0) {
      ctx.drawImage(img, sx, sy, g, g, x, y, g, g);
      return;
    }
    ctx.save();
    ctx.translate(x + (flip & TILE_FLIP_X ? g : 0), y + (flip & TILE_FLIP_Y ? g : 0));
    ctx.scale(flip & TILE_FLIP_X ? -1 : 1, flip & TILE_FLIP_Y ? -1 : 1);
    ctx.drawImage(img, sx, sy, g, g, 0, 0, g, g);
    ctx.restore();
  };
  for (const layer of map.tileLayers) {
    if (layer.z !== z) continue;
    const img = images.get(layer.tileset);
    if (!img) continue;
    for (const [x, y, t, f] of layer.tiles) drawTile(img, t, x, y, f);
  }
  for (const d of map.decors) {
    if (d.z !== z) continue;
    const img = images.get(d.tileset);
    if (img) drawTile(img, d.tileId, d.x, d.y, d.flipX ? TILE_FLIP_X : 0);
  }
  return canvas;
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: MapDef,
  view: View,
  layers: MapLayers,
  tiles: { back: HTMLCanvasElement | null; front: HTMLCanvasElement | null },
  selection: string | null,
  extras: { manualNav: Set<string>; navDraft: [number, number] | null } = { manualNav: new Set(), navDraft: null },
): void {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#101016';
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  ctx.imageSmoothingEnabled = false;
  const px = 1 / view.scale; // 一個螢幕像素在地圖座標的大小

  ctx.fillStyle = '#23222e';
  ctx.fillRect(0, 0, map.size.w, map.size.h);
  if (layers.tiles && tiles.back) ctx.drawImage(tiles.back, 0, 0);
  if (layers.tiles && tiles.front) {
    ctx.globalAlpha = 0.75;
    ctx.drawImage(tiles.front, 0, 0);
    ctx.globalAlpha = 1;
  }

  if (layers.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let x = 0; x <= map.size.w; x += map.tileSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.size.h);
    }
    for (let y = 0; y <= map.size.h; y += map.tileSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(map.size.w, y);
    }
    ctx.stroke();
  }

  if (layers.zones) {
    for (const z of map.spawnZones) {
      const sel = selection === `zone:${z.id}`;
      ctx.fillStyle = sel ? 'rgba(230,90,90,0.28)' : 'rgba(230,90,90,0.12)';
      ctx.fillRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h);
      ctx.strokeStyle = sel ? COLORS.select : COLORS.zone;
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h);
      ctx.setLineDash([]);
      label(ctx, `${z.pool.map((p) => p.mobId.replace('mob_', '')).join(' ')} ×${z.maxCount}`, z.rect.x + 3 * px, z.rect.y + 12 * px, COLORS.zone, px);
    }
  }

  if (layers.lights) {
    for (const [i, l] of map.lights.entries()) {
      const sel = selection === `light:${i}`;
      const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      grad.addColorStop(0, hexAlpha(l.color, 0.35 * Math.min(1, l.intensity)));
      grad.addColorStop(1, hexAlpha(l.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sel ? COLORS.select : COLORS.light;
      ctx.lineWidth = (sel ? 2 : 1) * px;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 4 * px * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (layers.footholds) {
    for (const f of map.footholds) {
      const sel = selection === `fh:${f.id}`;
      ctx.strokeStyle = sel ? COLORS.select : f.oneWay ? COLORS.oneWay : COLORS.foothold;
      ctx.lineWidth = (sel ? 4 : 2.5) * px;
      ctx.setLineDash(f.oneWay ? [6 * px, 3 * px] : []);
      ctx.beginPath();
      f.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      for (const [x, y] of f.points) ctx.fillRect(x - 2 * px, y - 2 * px, 4 * px, 4 * px);
    }
  }

  if (layers.walls) {
    ctx.lineWidth = 2.5 * px;
    for (const w of map.walls) {
      ctx.strokeStyle = COLORS.wall;
      ctx.beginPath();
      ctx.moveTo(w.x, w.yTop);
      ctx.lineTo(w.x, w.yBottom);
      ctx.stroke();
      // 小刻痕畫在實心那一側
      ctx.beginPath();
      for (let y = w.yTop + 4; y < w.yBottom; y += 8) {
        ctx.moveTo(w.x, y);
        ctx.lineTo(w.x + w.side * 4, y + 3);
      }
      ctx.lineWidth = 1 * px;
      ctx.stroke();
      ctx.lineWidth = 2.5 * px;
    }
    ctx.strokeStyle = COLORS.ceiling;
    for (const c of map.ceilings) {
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y);
      ctx.lineTo(c.x2, c.y);
      ctx.stroke();
    }
  }

  if (layers.climbables) {
    for (const c of map.climbables) {
      const sel = selection === `climb:${c.id}`;
      ctx.strokeStyle = sel ? COLORS.select : COLORS.climb;
      ctx.lineWidth = (sel ? 4 : 2) * px;
      ctx.setLineDash(c.type === 'rope' ? [4 * px, 3 * px] : []);
      ctx.beginPath();
      ctx.moveTo(c.x, c.yTop);
      ctx.lineTo(c.x, c.yBottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (layers.nav) drawNav(ctx, map, px, selection, extras.manualNav);
  if (extras.navDraft) {
    const [dx, dy] = extras.navDraft;
    ctx.strokeStyle = COLORS.select;
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(dx, dy, 6 * px, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, '起點', dx + 8 * px, dy - 8 * px, COLORS.select, px);
  }

  if (layers.entities) {
    for (const p of map.portals) {
      const sel = selection === `portal:${p.id}`;
      const color = p.type === 'spawn' ? COLORS.spawn : COLORS.portal;
      marker(ctx, p.x, p.y, color, sel, px);
      const text = p.type === 'spawn' ? '出生點' : p.type === 'next' ? '下一房 →' : p.type === 'prev' ? '← 上一房' : `→ ${p.toRoom} 房`;
      label(ctx, text, p.x - 20 * px, p.y - 40 * px, color, px);
    }
    for (const w of map.waveEntries) {
      ctx.fillStyle = COLORS.wave;
      ctx.beginPath();
      ctx.moveTo(w.x + w.dir * 14, w.y - 12);
      ctx.lineTo(w.x, w.y - 20);
      ctx.lineTo(w.x, w.y - 4);
      ctx.closePath();
      ctx.fill();
      label(ctx, '怪潮', w.x - 8 * px, w.y - 24 * px, COLORS.wave, px);
    }
    if (map.boss) {
      marker(ctx, map.boss.x, map.boss.y, COLORS.boss, selection === 'boss', px, 32, 48);
      label(ctx, `Boss ${map.boss.mobId}`, map.boss.x - 24 * px, map.boss.y - 54 * px, COLORS.boss, px);
    }
  }
}

/** 導航連線的顏色（與遊戲端 createMapPreview 的 showNav 一致）。 */
export const NAV_COLORS: Record<string, string> = {
  run: '#ffffff',
  jump: '#5ad16a',
  drop: '#ff9f4a',
  climb: '#5aa7e6',
  roll: '#c58cff',
  portal: '#5ad1d1',
};

type NavEdge = MapDef['nav']['edges'][number];

/** 連線在畫面上的線段：起點 = 起跳點（from 足場上），終點 = to 足場上最接近的點。 */
export function navEdgeSegment(map: MapDef, e: NavEdge): [number, number, number, number] | null {
  const from = map.footholds.find((f) => f.id === e.from);
  const to = map.footholds.find((f) => f.id === e.to);
  if (!from || !to) return null;
  const fx0 = from.points[0]![0];
  const fx1 = from.points[from.points.length - 1]![0];
  const sx = e.x ?? (fx0 + fx1) / 2;
  const sy = footholdYAt(from, Math.min(fx1, Math.max(fx0, sx))) ?? from.points[0]![1];
  const tx0 = to.points[0]![0];
  const tx1 = to.points[to.points.length - 1]![0];
  const tx = Math.min(tx1, Math.max(tx0, sx + (e.dir ?? 0) * 24));
  const ty = footholdYAt(to, tx) ?? to.points[0]![1];
  return [sx, sy - 4, tx, ty - 4];
}

export const navEdgeKey = (e: { from: number; to: number; type: string }) => `${e.from}>${e.to}>${e.type}`;

function drawNav(ctx: CanvasRenderingContext2D, map: MapDef, px: number, selection: string | null, manual: Set<string>) {
  for (const e of map.nav.edges) {
    const seg = navEdgeSegment(map, e);
    if (!seg) continue;
    const [x1, y1, x2, y2] = seg;
    const key = navEdgeKey(e);
    const selected = selection === `edge:${key}`;
    const color = selected ? COLORS.select : (NAV_COLORS[e.type] ?? COLORS.nav);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (selected ? 3 : manual.has(key) ? 2 : 1.25) * px;
    ctx.setLineDash(manual.has(key) ? [5 * px, 3 * px] : []);
    ctx.globalAlpha = selected ? 1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // 箭頭
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = 7 * px;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4));
    ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x1, y1, 2 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function distToSegment(x: number, y: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** 點擊導航連線：回傳 edge:{from}>{to}>{type}。 */
export function hitTestNav(map: MapDef, x: number, y: number, px: number): string | null {
  let best: { key: string; d: number } | null = null;
  for (const e of map.nav.edges) {
    const seg = navEdgeSegment(map, e);
    if (!seg) continue;
    const d = distToSegment(x, y, seg);
    if (d <= Math.max(4, 6 * px) && (!best || d < best.d)) best = { key: navEdgeKey(e), d };
  }
  return best ? `edge:${best.key}` : null;
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean, px: number, w = 16, h = 32) {
  ctx.fillStyle = hexAlpha(color, 0.25);
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = selected ? COLORS.select : color;
  ctx.lineWidth = (selected ? 2.5 : 1.5) * px;
  ctx.strokeRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.arc(x, y, 2.5 * px * 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number) {
  ctx.save();
  ctx.font = `${11 * px}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  const w = ctx.measureText(text).width;
  ctx.fillRect(x - 2 * px, y - 10 * px, w + 4 * px, 13 * px);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** 點擊測試：回傳被點到的物件（selection 字串）。 */
export function hitTest(map: MapDef, x: number, y: number, layers: MapLayers, px: number): string | null {
  const near = 6 * px;
  if (layers.entities) {
    for (const p of map.portals) if (Math.abs(x - p.x) <= 10 && y <= p.y + near && y >= p.y - 34) return `portal:${p.id}`;
    if (map.boss && Math.abs(x - map.boss.x) <= 16 && y <= map.boss.y && y >= map.boss.y - 48) return 'boss';
  }
  if (layers.lights) {
    for (const [i, l] of map.lights.entries()) if (Math.hypot(x - l.x, y - l.y) <= Math.max(8, near)) return `light:${i}`;
  }
  if (layers.climbables) {
    for (const c of map.climbables) if (Math.abs(x - c.x) <= Math.max(4, near) && y >= c.yTop && y <= c.yBottom) return `climb:${c.id}`;
  }
  if (layers.footholds) {
    const fh = footholdUnder(map, x, y, Math.max(4, near));
    if (fh) return `fh:${fh.id}`;
  }
  if (layers.zones) {
    for (const z of map.spawnZones) if (x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h) return `zone:${z.id}`;
  }
  return null;
}
