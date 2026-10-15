// 把主角原畫的 16 個關鍵姿勢放大成一張對照圖（格線每 10%），用來標記武器握點（painted.ts 的 HERO_HANDS）。
// 用法（在 game/）：npx tsx scripts/hero-poses.ts <輸出.png> [第一張 0–15] [張數] [每格像素]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { HERO_HANDS, heroPoses } from '../tools/placeholder-art/src/painted';

const out = process.argv[2] ?? 'hero-poses.png';
const first = Number(process.argv[3] ?? 0);
const count = Number(process.argv[4] ?? 16);
const cell = Number(process.argv[5] ?? 220);
const poses = heroPoses();
const columns = Math.min(4, count);
const png = new PNG({ width: cell * columns, height: cell * Math.ceil(count / columns) });
for (let i = 0; i < png.data.length; i += 4) png.data.set([30, 28, 40, 255], i);

poses.slice(first, first + count).forEach((pose, k) => {
  const n = first + k;
  const ox = (k % columns) * cell + 10;
  const oy = Math.floor(k / columns) * cell + 10;
  const scale = Math.min((cell - 20) / pose.width, (cell - 20) / pose.height);
  const w = Math.round(pose.width * scale);
  const h = Math.round(pose.height * scale);
  const hand = HERO_HANDS[n];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = pose.get(Math.min(pose.width - 1, Math.floor(x / scale)), Math.min(pose.height - 1, Math.floor(y / scale)));
      const i = ((oy + y) * png.width + ox + x) * 4;
      const onGrid = x % Math.max(1, Math.round(w / 10)) === 0 || y % Math.max(1, Math.round(h / 10)) === 0;
      if (p[3] > 0) png.data.set([p[0] * (onGrid ? 0.6 : 1), p[1] * (onGrid ? 0.6 : 1), p[2] * (onGrid ? 0.6 : 1), 255], i);
      else if (onGrid) png.data.set([70, 70, 95, 255], i);
    }
  }
  // 目前標記的握點：紅色十字
  if (hand) {
    const hx = ox + Math.round(hand.x * w);
    const hy = oy + Math.round(hand.y * h);
    for (let d = -6; d <= 6; d += 1) {
      for (const [x, y] of [
        [hx + d, hy],
        [hx, hy + d],
      ] as const) {
        if (x >= 0 && y >= 0 && x < png.width && y < png.height) png.data.set([255, 40, 40, 255], (y * png.width + x) * 4);
      }
    }
  }
});
fs.writeFileSync(out, PNG.sync.write(png));
console.log(`${out}：${poses.length} 個姿勢 ${poses.map((p) => `${p.width}x${p.height}`).join(' ')}`);
