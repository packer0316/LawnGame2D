import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://127.0.0.1:5182/';
await fs.mkdir('art-review/loading', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1825, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/content/manifest.json', async route => { await gate; await route.continue(); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.loading-art').evaluate(img => img.decode());
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  await page.screenshot({ path: 'art-review/loading/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'art-review/loading/mobile.png' });
  assert.ok(await page.locator('.loading-content').evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  }));
  await page.setViewportSize({ width: 1825, height: 800 });
  await page.evaluate(() => {
    window.loadingSamples = [];
    new MutationObserver(() => {
      const el = document.querySelector('[role="progressbar"]');
      if (el) window.loadingSamples.push(Number(el.getAttribute('aria-valuenow')));
    }).observe(document.body, { subtree: true, attributes: true, childList: true });
  });
  release();
  await page.locator('.hud-bottom-stack').waitFor({ timeout: 90000 });
  const samples = await page.evaluate(() => window.loadingSamples);
  assert.ok(samples.some(value => value > 20), 'received real asset progress');
  assert.ok(samples.every((value, i) => i === 0 || value >= samples[i - 1]), 'progress never regressed');
  assert.equal(await page.locator('.loading-screen').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();

  const retry = await browser.newPage();
  await retry.route('**/content/manifest.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await retry.goto(url);
  await retry.getByRole('alert').waitFor();
  assert.match(await retry.getByRole('alert').innerText(), /503/);
  await retry.screenshot({ path: 'art-review/loading/error.png' });
  await retry.unroute('**/content/manifest.json');
  await retry.getByRole('button', { name: '重新載入' }).click();
  await retry.locator('.hud-bottom-stack').waitFor({ timeout: 90000 });
  await retry.close();
  const missing = await browser.newPage();
  await missing.route('**/content/avatar/base.png', route => route.fulfill({ status: 404, body: 'missing image' }));
  await missing.goto(url);
  await missing.getByRole('alert').waitFor({ timeout: 30000 });
  assert.equal(await missing.locator('.hud-bottom-stack').count(), 0);
  assert.ok(Number(await missing.getByRole('progressbar').getAttribute('aria-valuenow')) < 100);
  await missing.close();
  console.log('PASS: desktop/mobile, actual monotonic progress, successful boot, HTTP error/retry and image failure.');
} finally { await browser.close(); }
