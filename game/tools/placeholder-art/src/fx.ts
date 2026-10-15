import { Canvas, hex, type RGBA } from './raster';
import { writeSheet, type SheetFrame } from './sheet';

/**
 * 特效 sheet（STUDIO_SPEC §8：fx/{fxId}.png + .sheet.json）。
 * 刀光用白色系，遊戲依押注等級染色；原點約定在畫布中心。
 */

interface FxArt {
  id: string;
  w: number;
  h: number;
  frames: number;
  durationMs: number;
  draw: (c: Canvas, i: number, t: number) => void;
}

const WHITE = hex('#ffffff');
const PALE = hex('#dff4ff');

/** 弧形刀光：從 a0 到 a1（度，0 = 右、順時針），厚度隨進度變細。 */
function arc(c: Canvas, cx: number, cy: number, r: number, a0: number, a1: number, thickness: number, color: RGBA): void {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3));
  for (let s = 0; s <= steps; s += 1) {
    const k = s / steps;
    const a = ((a0 + (a1 - a0) * k) * Math.PI) / 180;
    const w = Math.max(1, Math.round(thickness * Math.sin(k * Math.PI)));
    for (let d = 0; d < w; d += 1) {
      c.set(cx + Math.cos(a) * (r - d), cy + Math.sin(a) * (r - d), d === 0 ? WHITE : color);
    }
  }
}

function slash(id: string, a0: number, a1: number, r: number): FxArt {
  return {
    id,
    w: 96,
    h: 96,
    frames: 4,
    durationMs: 45,
    draw(c, i) {
      const sweep = [0.45, 0.85, 1, 1][i]!;
      const fade = [1, 1, 0.7, 0.35][i]!;
      const end = a0 + (a1 - a0) * sweep;
      const start = i >= 2 ? a0 + (a1 - a0) * (i === 2 ? 0.35 : 0.7) : a0;
      arc(c, 48, 48, r, start, end, 7, hex('#bfe8ff', Math.round(230 * fade)));
      if (i <= 1) arc(c, 48, 48, r - 9, start, end, 3, hex('#ffffff', 140));
      arc(c, 48, 48, r + 3, start + 8, end, 2, hex('#a3e9de', Math.round(85 * fade)));
      for (let k = 0; k < 4; k++) {
        const a = (end - k * 17) * Math.PI / 180;
        const d = r + 4 + i * 3 + k;
        c.fillRect(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, 2, 1, hex('#e3ffec', Math.round(170 * fade)));
      }
    },
  };
}

const FX: FxArt[] = [
  // 面向左：負 x 為前方。角度以畫面座標（y 向下）計。
  slash('slash_swing1', 250, 140, 34),
  slash('slash_swing2', 200, 160, 38),
  slash('slash_swing3', 280, 120, 42),
  {
    id: 'slash_cast',
    w: 64,
    h: 64,
    frames: 5,
    durationMs: 50,
    draw(c, i, t) {
      const r = 6 + t * 22;
      for (let k = 0; k < 12; k += 1) {
        const a = (k / 12) * Math.PI * 2 + t;
        c.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2, 2, hex('#e0c2ff', Math.round(255 * (1 - t * 0.7))));
      }
      if (i < 3) c.fillEllipse(32, 32, 6 - i * 2, 6 - i * 2, WHITE);
    },
  },
  {
    id: 'hit_spark',
    w: 32,
    h: 32,
    frames: 5,
    durationMs: 40,
    draw(c, i, t) {
      const r = 3 + t * 12;
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.3;
        const len = k % 2 ? r * 0.6 : r;
        c.line(16 + Math.cos(a) * len * 0.4, 16 + Math.sin(a) * len * 0.4, 16 + Math.cos(a) * len, 16 + Math.sin(a) * len, k % 2 ? PALE : WHITE);
      }
      if (i < 2) c.fillEllipse(16, 16, 4 - i * 2, 4 - i * 2, WHITE);
    },
  },
  {
    id: 'coin',
    w: 12,
    h: 12,
    frames: 6,
    durationMs: 70,
    draw(c, i) {
      const widths = [5, 4, 2, 1, 2, 4];
      const w = widths[i]!;
      c.fillEllipse(6, 6, w, 5, hex('#f6c544'));
      if (w > 1) {
        c.fillEllipse(6, 6, Math.max(1, w - 1), 4, hex('#b88b3e'));
        c.fillEllipse(6, 5, Math.max(1, w - 2), 3, hex('#e9c77d'));
        c.fillPolygon([[6,3],[8,5],[6,8],[4,5]],hex('#fff1b6'));
        c.set(6-w+1,3,WHITE);
      }
      c.outline(hex('#9a6412'));
    },
  },
  {
    id: 'dust',
    w: 40,
    h: 24,
    frames: 5,
    durationMs: 60,
    draw(c, _i, t) {
      for (const side of [-1, 1]) {
        const x = 20 + side * (4 + t * 14);
        c.fillEllipse(x, 18 - t * 4, 5 - t * 3, 4 - t * 2.5, hex('#e8e1d2', Math.round(220 * (1 - t))));
      }
      for (let k = 0; k < 5; k++) {
        const x = 20 + Math.sin(k * 2.4) * t * 18, y = 15 - Math.abs(Math.cos(k * 2.4)) * t * 14;
        c.fillPolygon([[x-2,y],[x,y-2],[x+2,y],[x,y+1]],hex(k % 2 ? '#a8bd7d' : '#dec38c',Math.round(230*(1-t))));
      }
    },
  },
  {
    id: 'explosion',
    w: 96,
    h: 96,
    frames: 8,
    durationMs: 55,
    draw(c, i, t) {
      const r = 8 + t * 38;
      c.fillEllipse(48, 48, r, r, hex('#ff7a2f', Math.round(220 * (1 - t))));
      for (let k = 0; k < 7; k++) {
        const a = k * Math.PI * 2 / 7 + t;
        c.fillEllipse(48+Math.cos(a)*r*0.7,48+Math.sin(a)*r*0.7,r*0.38,r*0.38,hex('#f2a34d',Math.round(190*(1-t))));
      }
      c.fillEllipse(48, 48, r * 0.7, r * 0.7, hex('#ffcf4a', Math.round(240 * (1 - t))));
      if (i < 4) c.fillEllipse(48, 48, r * 0.4, r * 0.4, WHITE);
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * Math.PI * 2;
        c.fillRect(48 + Math.cos(a) * r * 1.1, 48 + Math.sin(a) * r * 1.1, 3, 3, hex('#5a4a5e', Math.round(255 * (1 - t))));
      }
    },
  },
  {
    id: 'magic_bolt',
    w: 24,
    h: 16,
    frames: 4,
    durationMs: 60,
    draw(c, i) {
      c.fillEllipse(8, 8, 7, 7, hex('#67cbbb',50));
      c.fillPolygon([[1,8],[8,2],[14,8],[8,14]], hex('#60b9cb'));
      c.fillPolygon([[3,8],[8,4],[11,8],[8,11]],hex('#e5fff3'));
      for (let k = 0; k < 3; k += 1) c.fillRect(13 + k * 3, 7 + ((i + k) % 2) * 2 - 1, 2, 2, hex('#c99bff', 180 - k * 50));
    },
  },
  {
    id: 'arrow',
    w: 24,
    h: 8,
    frames: 1,
    durationMs: 100,
    draw(c) {
      c.line(3, 4, 21, 4, hex('#8a5a2b'));
      c.fillPolygon([[0, 4], [5, 1], [5, 7]], hex('#c9d2df'));
      c.line(19, 2, 23, 1, hex('#e9e2cf'));
      c.line(19, 6, 23, 7, hex('#e9e2cf'));
    },
  },
  {
    id: 'shuriken',
    w: 12,
    h: 12,
    frames: 4,
    durationMs: 40,
    draw(c, i) {
      const a0 = (i * Math.PI) / 8;
      for (let k = 0; k < 4; k += 1) {
        const a = a0 + (k * Math.PI) / 2;
        c.fillPolygon(
          [
            [6, 6],
            [6 + Math.cos(a) * 6, 6 + Math.sin(a) * 6],
            [6 + Math.cos(a + 0.6) * 2, 6 + Math.sin(a + 0.6) * 2],
          ],
          hex('#c9d2df'),
        );
      }
      c.set(6, 6, hex('#4a3a5c'));
    },
  },
];

export function writeFx(contentDir: string): { fxIds: string[] } {
  for (const art of FX) {
    const frames: SheetFrame[] = [];
    for (let i = 0; i < art.frames; i += 1) {
      const canvas = new Canvas(art.w, art.h);
      art.draw(canvas, i, art.frames === 1 ? 1 : i / (art.frames - 1));
      frames.push({ layer: null, index: i, canvas, durationMs: art.durationMs });
    }
    writeSheet(`${contentDir}/fx`, art.id, { frames, tags: [{ name: 'play', from: 0, to: art.frames - 1 }] });
  }
  return { fxIds: FX.map((f) => f.id) };
}
