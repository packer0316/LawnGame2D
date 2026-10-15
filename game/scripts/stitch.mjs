// 把多張截圖橫向拼成一張（檢查用）。用法：node scripts/stitch.mjs <輸出.png> <輸入1.png> <輸入2.png> ...
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [out, ...inputs] = process.argv.slice(2);
const images = inputs.map((file) => PNG.sync.read(fs.readFileSync(file)));
const width = images.reduce((sum, img) => sum + img.width, 0);
const height = Math.max(...images.map((img) => img.height));
const result = new PNG({ width, height });
let x0 = 0;
for (const img of images) {
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const s = (y * img.width + x) * 4;
      const d = (y * width + x0 + x) * 4;
      result.data[d] = img.data[s];
      result.data[d + 1] = img.data[s + 1];
      result.data[d + 2] = img.data[s + 2];
      result.data[d + 3] = 255;
    }
  }
  x0 += img.width;
}
fs.writeFileSync(out, PNG.sync.write(result));
console.log(`${out}：${images.length} 張，${width}×${height}`);
