/**
 * 冒煙測試：用本機的 Edge／Chrome（playwright-core，不另外下載瀏覽器）開啟編輯器，
 * 走一遍主要流程並截圖。需要先啟動 dev server（LAWN_PROJECT_ROOT 指向測試專案）。
 *
 * 用法：npx tsx tools/e2e/src/smoke.ts --out <截圖資料夾> [--url http://localhost:5180] [--steps map,monster]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const outDir = resolve(arg('out', 'e2e-shots'));
const baseUrl = arg('url', 'http://localhost:5180');
const steps = new Set(arg('steps', 'map').split(','));
mkdirSync(outDir, { recursive: true });

const problems: string[] = [];
let shotIndex = 0;

async function shot(page: Page, name: string) {
  const file = join(outDir, `${String(++shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`📸 ${file}`);
}

async function status(page: Page) {
  return (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ');
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(15000);
  // 整體逾時保護：避免卡住
  const watchdog = setTimeout(() => {
    console.error('✖ 冒煙測試超過 3 分鐘，強制結束');
    void browser.close().finally(() => process.exit(2));
  }, 180_000);
  page.on('console', (m) => {
    // 讀取不存在的 content/ 檔案是正常的探測（例如新地圖），HTTP 404 另外由 response 判斷
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !(r.status() === 404 && r.url().includes('/__devfs/'))) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  try {
    await runSteps(page);
  } catch (error) {
    await shot(page, 'FAILED').catch(() => undefined);
    for (const p of problems) console.log(`  ${p}`);
    throw error;
  } finally {
    clearTimeout(watchdog);
    await browser.close();
  }
  if (problems.length > 0) {
    console.log('\n⚠ 瀏覽器錯誤：');
    for (const p of problems) console.log(`  ${p}`);
    process.exitCode = 1;
  } else {
    console.log('\n✔ 沒有瀏覽器錯誤');
  }
}

async function runSteps(page: Page) {
  await page.goto(`${baseUrl}/?devfs`);
  await page.waitForSelector('.shell', { timeout: 15000 });
  console.log('開啟：', await status(page));

  if (steps.has('map')) {
    await page.getByRole('button', { name: '地圖' }).click();
    await page.waitForTimeout(500);
    await shot(page, 'map-before-import');
    await page.getByRole('button', { name: '匯入', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tree-item').length >= 20, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    console.log('匯入：', await status(page));
    await shot(page, 'map-imported');

    await page.locator('.tree-item', { hasText: 'map_0005' }).click();
    await page.waitForTimeout(400);
    // 點一下出生點附近選取物件
    await shot(page, 'map-0005');

    await page.getByRole('button', { name: /^驗證/ }).click();
    await page.waitForTimeout(800);
    console.log('驗證：', await status(page));
    await shot(page, 'map-validate');

    await page.locator('.tree-item', { hasText: '主題' }).click();
    await page.waitForTimeout(800);
    await shot(page, 'map-themes');

    await page.getByRole('button', { name: /^匯出/ }).click();
    await page.waitForTimeout(1500);
    console.log('匯出：', await status(page));
    await shot(page, 'map-exported');
  }

  if (steps.has('monster')) {
    await page.getByRole('button', { name: '怪物', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tree-item').length >= 1, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    await shot(page, 'monster-list');
    const unregistered = page.locator('.tree-item', { hasText: '未登錄' }).first();
    if (await unregistered.count()) {
      await unregistered.click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: '登錄這隻怪物' }).click();
      await page.waitForTimeout(800);
      console.log('登錄：', await status(page));
      await shot(page, 'monster-registered');
    }
    await page.locator('.tree-item', { hasText: 'mob_0006' }).click();
    await page.waitForTimeout(800);
    await shot(page, 'monster-boss');
    await page.locator('.bottom select').first().selectOption('die');
    await page.waitForTimeout(600);
    await shot(page, 'monster-die');
    // 拖曳判定框：從中心往右下拖 40px
    const canvas = page.locator('.canvas canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.locator('.tree-item', { hasText: 'mob_0001' }).click();
      await page.waitForTimeout(500);
      await page.locator('.bottom select').first().selectOption('idle');
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height * 0.72 - 30;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 40, cy + 20, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      await shot(page, 'monster-hitbox-dragged');
    }
    await page.getByRole('button', { name: /^驗證/ }).click();
    await page.waitForTimeout(1500);
    console.log('驗證：', await status(page));
    await shot(page, 'monster-validate');
  }

  if (steps.has('rooms')) {
    if (await page.locator('.issues').count()) await page.locator('.issues').getByRole('button', { name: '關閉' }).click();
    await page.getByRole('button', { name: '房間表', exact: true }).click();
    await page.waitForTimeout(1500);
    const gen = page.getByRole('button', { name: /^從地圖產生 \d+ 房/ });
    if (await gen.count()) await gen.click();
    else await page.getByRole('button', { name: '從地圖重新產生全部' }).click();
    await page.waitForTimeout(600);
    await page.locator('.tree-item', { hasText: '05' }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'rooms');
  }

  if (steps.has('export')) {
    await page.getByRole('button', { name: /^驗證/ }).click();
    await page.waitForTimeout(2000);
    console.log('驗證：', await status(page));
    await shot(page, 'export-validate');
    await page.getByRole('button', { name: /^匯出/ }).click();
    await page.waitForTimeout(3000);
    console.log('匯出：', await status(page));
    await shot(page, 'export-done');
  }

  if (steps.has('avatar')) {
    await page.getByRole('button', { name: '角色造型', exact: true }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'avatar-base');
    await page.locator('.tree-item', { hasText: '調色盤' }).click();
    await page.waitForTimeout(1200);
    await shot(page, 'avatar-palettes');
    await page.locator('.tree-item', { hasText: 'top_0001' }).click();
    await page.waitForTimeout(1200);
    await page.locator('.bottom select').first().selectOption('run');
    await page.waitForTimeout(800);
    await shot(page, 'avatar-top-run');
    await page.locator('.tree-item', { hasText: 'hair_0001' }).click();
    await page.waitForTimeout(1000);
    await page.getByText('拖曳對齊（錨點部件）').click();
    const box = (await page.locator('.canvas canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height * 0.45 - 8, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shot(page, 'avatar-hair-dragged');
    const unreg = page.locator('.tree-item', { hasText: '未登錄' }).first();
    if (await unreg.count()) {
      await unreg.click();
      await page.getByRole('button', { name: '登錄這個部件' }).click();
      await page.waitForTimeout(1000);
      await shot(page, 'avatar-registered');
    }
    await page.locator('.tree-item', { hasText: '試穿' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /隨機搭配/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, 'avatar-tryon');
    await page.getByRole('button', { name: /^驗證/ }).click();
    await page.waitForTimeout(3000);
    console.log('驗證：', await status(page));
    await shot(page, 'avatar-validate');
  }

  if (steps.has('nav')) {
    await page.getByRole('button', { name: '地圖', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '匯入', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.locator('.tree-item', { hasText: 'map_0005' }).click();
    await page.getByRole('button', { name: '顯示導航圖以編輯' }).click();
    await page.waitForTimeout(500);
    await shot(page, 'nav-shown');
    console.log('導航圖：', (await page.locator('.props .section', { hasText: '導航圖' }).first().innerText()).replace(/\s+/g, ' '));
    // 在畫面上找一條連線點選：掃描畫布找到選取
    const canvas = page.locator('.canvas canvas').first();
    const box = (await canvas.boundingBox())!;
    let found = false;
    for (let gy = 0.35; gy < 0.85 && !found; gy += 0.02) {
      for (let gx = 0.1; gx < 0.9 && !found; gx += 0.02) {
        await page.mouse.click(box.x + box.width * gx, box.y + box.height * gy);
        found = (await page.getByRole('button', { name: '刪除這條連線' }).count()) > 0;
      }
    }
    console.log('點到連線：', found);
    if (found) {
      await shot(page, 'nav-edge-selected');
      await page.getByRole('button', { name: '刪除這條連線' }).click();
      await page.waitForTimeout(500);
      console.log('刪除後：', (await page.locator('.props .section', { hasText: '導航圖' }).first().innerText()).replace(/\s+/g, ' '));
    }
    await shot(page, 'nav-after-delete');
  }

  if (steps.has('preview')) {
    await page.getByRole('button', { name: '怪物', exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator('.tree-item', { hasText: 'mob_0004' }).click();
    await page.getByRole('button', { name: '遊戲預覽' }).click();
    await page.waitForTimeout(3000);
    await shot(page, 'monster-preview');
    await page.getByRole('button', { name: '模擬擊殺' }).click();
    await page.waitForTimeout(700);
    await shot(page, 'monster-preview-kill');
    await page.getByRole('button', { name: '地圖', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '光影預覽' }).click();
    await page.waitForTimeout(3000);
    const host = await page.locator('.canvas .canvas-host').last().boundingBox();
    if (host) {
      await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
      await page.mouse.down();
      await page.mouse.move(host.x + host.width / 2 - 300, host.y + host.height / 2, { steps: 6 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    await shot(page, 'map-preview');
    await page.getByText('足場疊加').click();
    await page.waitForTimeout(800);
    await shot(page, 'map-preview-overlay');
  }

  if (steps.has('play')) {
    if (await page.locator('.issues').count()) await page.locator('.issues').getByRole('button', { name: '關閉' }).click();
    await page.getByRole('button', { name: '地圖', exact: true }).click();
    await page.waitForTimeout(800);
    const item = page.locator('.tree-item', { hasText: 'map_0008' });
    if (await item.count()) await item.click();
    await page.getByRole('button', { name: '▶ 試玩' }).click();
    await page.waitForTimeout(5000);
    await shot(page, 'playtest');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    await shot(page, 'playtest-move');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('試玩結束後覆蓋層：', await page.locator('.overlay').count());
  }

}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
