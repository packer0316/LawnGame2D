// 用本機 Edge 開啟遊戲頁面並截圖，同時印出瀏覽器 console 的錯誤。
// 用法：node scripts/shot.mjs [url] [輸出檔] [等待毫秒] [寬x高] [按鍵腳本]
// 按鍵腳本範例："ArrowRight:800,Space:100,KeyZ:100"（按住毫秒數，依序執行）
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shot.png';
const waitMs = Number(process.argv[4] ?? 1500);
const [width, height] = (process.argv[5] ?? '1280x720').split('x').map(Number);
const keyScript = process.argv[6] ?? '';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);
for (const step of keyScript.split(',').filter(Boolean)) {
  const [key, hold] = step.split(':');
  await page.keyboard.down(key);
  await page.waitForTimeout(Number(hold ?? 50));
  await page.keyboard.up(key);
}
if (keyScript) await page.waitForTimeout(300);
await page.screenshot({ path: out });
const fps = await page.evaluate(() => window.__lawnStats?.() ?? null).catch(() => null);
await browser.close();

console.log(`screenshot: ${out}`);
if (fps) console.log('stats:', JSON.stringify(fps));
console.log(logs.length ? logs.join('\n') : '(no console errors)');
