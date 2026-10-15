/** 怪物驗證（STUDIO_SPEC §5）。缺少必備動作會擋匯出。 */
import { MonsterDefSchema, MonsterMathFileSchema } from '@lawn/shared';
import type { AseSheet, MonsterDef, MonsterMathFile } from '@lawn/shared';
import type { Issue } from '../state/validation';
import { TIER_RULES } from './defaults';
import { ACTIONS, tagBounds, tagDurationMs } from './sheet';

export function validateMonster(def: MonsterDef, sheet: AseSheet | null, math: MonsterMathFile | undefined): Issue[] {
  const issues: Issue[] = [];
  const path = `monsters/${def.id}.json`;
  const error = (message: string) => issues.push({ severity: 'error', page: 'monster', path, target: def.id, message: `${def.id}：${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', page: 'monster', path, target: def.id, message: `${def.id}：${message}` });

  const parsed = MonsterDefSchema.safeParse(def);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const where = i.path.map(String).join('.');
      error(where.startsWith('tags.') ? `缺少必備動作 ${where.slice(5)} 的 Tag 對應` : `${where}：${i.message}`);
    }
  }
  if (!sheet) {
    error(`找不到 sheet ${def.sheet}（請先用 Aseprite 匯出）`);
    return issues;
  }

  for (const action of [...ACTIONS, 'appear'] as const) {
    const name = def.tags[action];
    if (!name) continue;
    if (!sheet.tags.has(name)) error(`動作 ${action} 對應的 Tag「${name}」不在 sheet 中（sheet 有：${[...sheet.tags.keys()].join('、')}）`);
  }

  const die = sheet.tags.get(def.tags.die);
  if (die && def.fx.coinFrame > die.to - die.from) error(`噴金幣的幀 ${def.fx.coinFrame} 超過 die 的長度（${die.to - die.from + 1} 幀）`);
  const hit = sheet.tags.get(def.tags.hit);
  if (hit) {
    const ms = tagDurationMs(sheet, hit, def.frameDurations);
    if (ms > 300) warn(`受擊動作總長 ${ms}ms，建議 ≤ 300ms`);
  }
  for (const [frame, ms] of Object.entries(def.frameDurations ?? {})) {
    if (!Number.isInteger(ms) || ms <= 0) error(`第 ${frame} 幀的時間 ${ms} 必須是正整數毫秒`);
  }
  if (def.hitbox.w <= 0 || def.hitbox.h <= 0) error('判定框的寬高必須大於 0');
  if (def.hitbox.y + def.hitbox.h > 1) warn('判定框超出腳底（原點在腳底，判定框通常在 y ≤ 0）');

  // 數值
  const m = math?.monsters.find((x) => x.id === def.mathId);
  if (!m) {
    error(`數值檔沒有 ${def.mathId}`);
  } else {
    const rule = TIER_RULES[m.tier];
    const [lo, hi] = typeof m.multiplier === 'number' ? [m.multiplier, m.multiplier] : m.multiplier;
    if (lo > hi) error(`倍率區間 ${lo}–${hi} 的下限大於上限`);
    if (lo < rule.multiplier[0] || hi > rule.multiplier[1]) warn(`${m.tier} 的倍率建議在 ${rule.multiplier[0]}–${rule.multiplier[1]}×，目前 ${lo === hi ? lo : `${lo}–${hi}`}×`);
    if ((m.tier === 'elite' || m.tier === 'boss') && !def.showHpBar) warn(`${m.tier} 建議顯示血條`);
    if (m.tier === 'boss' && !def.tags.appear) warn('Boss 建議有登場動作 appear');
    const idle = sheet.tags.get(def.tags.idle);
    const b = idle ? tagBounds(sheet, idle) : undefined;
    if (b && (b.h < rule.height[0] || b.h > rule.height[1])) warn(`${m.tier} 的身高建議 ${rule.height[0]}–${rule.height[1]} 像素，目前 idle 約 ${b.h} 像素`);
  }
  return issues;
}

export function validateMathFile(file: MonsterMathFile | undefined, monsterIds: string[]): Issue[] {
  const path = 'math/monsters.math.json';
  if (!file) return monsterIds.length ? [{ severity: 'error', page: 'monster', path, message: `缺少數值檔 ${path}` }] : [];
  const issues: Issue[] = [];
  const parsed = MonsterMathFileSchema.safeParse(file);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ severity: 'error', page: 'monster', path, message: `數值檔 ${i.path.map(String).join('.')}：${i.message}` });
  }
  const seen = new Set<string>();
  for (const m of file.monsters) {
    if (seen.has(m.id)) issues.push({ severity: 'error', page: 'monster', path, message: `數值 ${m.id} 重複` });
    seen.add(m.id);
  }
  return issues;
}
