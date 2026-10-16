import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url = process.env.LAWN_REVIEW_URL ?? 'http://127.0.0.1:5184';
await fs.mkdir('art-review/mobile-hud', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [], layouts = [];
const context = await browser.newContext({ viewport: { width: 544, height: 284 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const open = async () => {
  await page.goto(`${url}/?class=warrior&room=1`);
  await page.locator('.hud-mobile').waitFor({ timeout: 60000 });
};
const geometry = () => page.evaluate(() => {
  const rect = selector => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
  };
  const skills = [...document.querySelectorAll('.mobile-skill')].map(element => element.getBoundingClientRect());
  const tools = [...document.querySelectorAll('.hud-top-right button')].map(element => element.getBoundingClientRect());
  const actions = [...document.querySelectorAll('.mobile-side-button')];
  return { width: innerWidth, height: innerHeight, bar: rect('.mobile-bottom-bar'), skills: rect('.mobile-skills'), finance: rect('.mobile-finance'), actions: rect('.mobile-side-actions'), tools: rect('.hud-top-right'), location: rect('.mobile-location'), skillCount: skills.length, singleRow: skills.every(box => Math.abs(box.y - skills[0].y) < 1), verticalTools: tools.every(box => Math.abs(box.x - tools[0].x) < 1), roundActions: actions.every(element => { const box = element.getBoundingClientRect(); return Math.abs(box.width - box.height) < 1 && getComputedStyle(element).borderRadius === '50%'; }), overflow: document.documentElement.scrollWidth - innerWidth };
});
try {
  await open();
  assert.equal(await page.getByRole('button', { name: '掛機紀錄', exact: true }).count(), 0);
  await page.getByRole('button', { name: '自動冒險', exact: true }).tap();
  await page.getByRole('button', { name: '掛機紀錄', exact: true }).waitFor();
  await page.getByRole('button', { name: '自動冒險', exact: true }).tap();
  for (const [width, height] of [[544, 284], [844, 390], [932, 430], [390, 844], [360, 640], [320, 568], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const layout = await geometry();
    layouts.push(layout);
    await page.screenshot({ path: `art-review/mobile-hud/${width}-${height}.png` });
    assert.ok(layout.singleRow && layout.verticalTools && layout.roundActions);
    for (const key of ['skills', 'finance', 'actions', 'tools', 'location']) {
      const box = layout[key];
      assert.ok(box.x >= 0 && box.y >= 0 && box.right <= width + 1 && box.bottom <= height + 1, `${key} clipped at ${width} x ${height}`);
    }
    assert.ok(layout.tools.bottom <= layout.actions.y, '右側小圖示不可與冒險／背包重疊');
    assert.ok(layout.skills.right + 4 <= layout.actions.x, '圓形入口須在技能列右側');
    assert.ok(Math.abs(layout.skills.y + layout.skills.height / 2 - layout.actions.y - layout.actions.height / 2) < 1, '技能與圓形入口須同排置中');
    assert.ok(layout.finance.right <= layout.skills.x || layout.finance.bottom <= layout.skills.y, '財產／押注不可蓋住技能');
    assert.ok(layout.bar.height <= (width > 520 ? 46 : 68), '底部操作帶不可過高');
    assert.equal(await page.locator('.mobile-side-button.auto-button').innerText(), 'AUTO');
    const reportButton = await page.getByRole('button', { name: '掛機紀錄', exact: true }).boundingBox();
    assert.ok(reportButton && reportButton.x >= 0 && reportButton.y >= layout.tools.bottom && reportButton.x + reportButton.width <= width && reportButton.y + reportButton.height <= layout.actions.y, '掛機紀錄入口不可遮住其他操作');
    assert.ok(reportButton.x >= layout.finance.right || reportButton.y + reportButton.height <= layout.finance.y, '掛機紀錄不可遮住財產／押注');
    assert.equal(layout.overflow, 0);
    assert.equal(await page.locator('.hud-bottom').count(), 0);
  }

  await page.setViewportSize({ width: 544, height: 284 });
  await page.getByRole('combobox', { name: '職業' }).selectOption('mage');
  await page.waitForFunction(() => document.querySelector('.mobile-skill.basic .pixel-icon')?.dataset.art === 'skill_0011');
  await page.locator('.mobile-skill').nth(1).tap();
  await page.waitForFunction(() => document.querySelectorAll('.mobile-skill')[1]?.disabled);
  const bet = await page.locator('.mobile-finance .value strong').textContent();
  await page.getByRole('button', { name: '增加押注', exact: true }).tap();
  await page.waitForFunction(previous => document.querySelector('.mobile-finance .value strong').textContent !== previous, bet);
  await page.getByRole('button', { name: '減少押注', exact: true }).tap();
  await page.waitForFunction(previous => document.querySelector('.mobile-finance .value strong').textContent === previous, bet);
  await page.getByRole('button', { name: '選擇押注', exact: true }).tap();
  await page.getByRole('listbox', { name: '每刀押注' }).waitFor();
  await page.screenshot({ path: 'art-review/mobile-hud/bet-picker.png' });
  await page.getByRole('listbox', { name: '每刀押注' }).getByRole('option').nth(1).tap();
  await page.locator('.bet-picker').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '自動冒險', exact: true }).tap();
  await page.waitForFunction(() => document.querySelector('.auto-button').getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: '掛機紀錄', exact: true }).tap();
  await page.getByRole('dialog', { name: '掛機收益', exact: true }).waitFor();
  assert.match(await page.locator('.auto-report-status').textContent(), /掛機中/);
  await page.screenshot({ path: 'art-review/mobile-hud/auto-report-running.png' });
  await page.getByRole('button', { name: '財產曲線', exact: true }).tap();
  await page.getByRole('button', { name: '放大財產變化', exact: true }).tap();
  await page.getByRole('dialog', { name: '財產變化（放大）', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '財產變化（放大）', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog', { name: '掛機收益', exact: true }).count(), 1);
  await page.getByRole('button', { name: '關閉掛機收益', exact: true }).tap();
  await page.getByRole('button', { name: '自動冒險', exact: true }).tap();
  await page.getByRole('button', { name: '掛機紀錄', exact: true }).tap();
  await page.waitForFunction(() => document.querySelector('.auto-report-status')?.textContent.includes('已停止'));
  await page.getByRole('button', { name: '關閉掛機收益', exact: true }).tap();
  await page.getByRole('button', { name: '開啟背包', exact: true }).tap();
  await page.getByRole('button', { name: '關閉背包', exact: true }).tap();

  await page.getByRole('button', { name: '設定', exact: true }).tap();
  await page.getByRole('dialog', { name: '設定', exact: true }).waitFor();
  await page.screenshot({ path: 'art-review/mobile-hud/settings.png' });
  await page.getByRole('button', { name: '自動冒險設定', exact: true }).tap();
  await page.getByRole('dialog', { name: '自動冒險設定', exact: true }).waitFor();
  await page.getByRole('button', { name: '關閉設定', exact: true }).tap();
  await page.getByRole('button', { name: '設定', exact: true }).tap();
  await page.getByRole('button', { name: '掛機收益', exact: true }).tap();
  await page.getByRole('dialog', { name: '掛機收益', exact: true }).waitFor();
  await page.getByRole('button', { name: '關閉掛機收益', exact: true }).tap();

  await page.getByRole('button', { name: '設定', exact: true }).tap();
  await page.getByRole('button', { name: '電腦版本', exact: true }).tap();
  await page.locator('.hud-desktop').waitFor();
  assert.equal(await page.locator('.mobile-skills').count(), 0);
  assert.equal(await page.locator('.class-select button.active .pixel-icon').getAttribute('data-art'), 'mage');
  assert.equal(await page.evaluate(() => localStorage.getItem('lawn.ui.layout.v1')), 'desktop');
  await page.getByRole('button', { name: '手機版本', exact: true }).click();
  await page.locator('.hud-mobile').waitFor();
  assert.equal(await page.getByRole('combobox', { name: '職業' }).inputValue(), 'mage');
  await page.getByRole('button', { name: '關閉設定', exact: true }).tap();
  await page.setViewportSize({ width: 1600, height: 900 });
  await open();
  assert.equal(await page.evaluate(() => localStorage.getItem('lawn.ui.layout.v1')), 'mobile');
  await page.getByRole('button', { name: '設定', exact: true }).tap();
  await page.getByRole('button', { name: '自動', exact: true }).tap();
  await page.locator('.hud-desktop').waitFor();
  await page.getByRole('button', { name: '關閉設定', exact: true }).tap();
  await page.screenshot({ path: 'art-review/mobile-hud/desktop.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('.hud-mobile').waitFor();
  await page.getByRole('button', { name: '操作說明', exact: true }).tap();
  await page.getByRole('button', { name: '關閉操作說明', exact: true }).tap();
  assert.equal(errors.length, 0);
  await fs.writeFile('art-review/mobile-hud/report.json', JSON.stringify({ layouts, errors, interactions: 'passed' }, null, 2));
  console.log(JSON.stringify({ layouts, errors, interactions: 'passed' }));
} finally { await browser.close(); }
