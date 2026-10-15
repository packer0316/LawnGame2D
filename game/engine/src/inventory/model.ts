import type { ClassId } from '@lawn/shared';
import { OUTFITS, OUTFIT_BY_ID } from './outfits';
import { BAG_CAPACITY, BASE_SELL_VALUE, DROP_RULES, SCROLL_RATES, SCROLL_RULES, UPGRADE_SLOTS, WEAPONS, WEAPON_BY_ID, type ScrollRate } from './catalog';

export interface WeaponInstance { uid: string; definitionId: string; slotsLeft: number; successes: number; bonusValue: number }
export interface InventoryState { items: WeaponInstance[]; equipped: Partial<Record<ClassId, string>>; outfits: string[]; equippedOutfit: string | null; scrolls: Record<ScrollRate, number>; nextId: number; demoGranted: boolean }
export interface InventoryProfile { version: 1; balance: number; inventory: InventoryState }
export interface InventoryFeedback { id: number; kind: 'equipped' | 'success' | 'failed' | 'destroyed' | 'sold' | 'bought' | 'drop' | 'error'; message: string }
export interface InventorySnapshot { inventory: InventoryState; feedback?: InventoryFeedback; storageError?: boolean }
export type InventoryAction = { type: 'equipOutfit'; outfitId: string } | { type: 'unequipOutfit' } | { type: 'equip'; uid: string } | { type: 'unequip'; classId: ClassId } | { type: 'sell'; uid: string } | { type: 'upgrade'; uid: string; rate: ScrollRate } | { type: 'buyScroll'; rate: ScrollRate } | { type: 'demoCollection' } | TestToolAction;
/** 設定面板的測試工具：不看模式、不限次數。 */
export type TestToolAction = { type: 'grantAllWeapons' } | { type: 'grantScrolls'; count: number } | { type: 'reset' };
export const sellValue = (w: WeaponInstance): number => BASE_SELL_VALUE + w.bonusValue;
export function addWeapon(state: InventoryState, definitionId: string): WeaponInstance | undefined {
  if (state.items.length >= BAG_CAPACITY || !WEAPON_BY_ID.has(definitionId)) return;
  const item = { uid: `weapon-${state.nextId++}`, definitionId, slotsLeft: UPGRADE_SLOTS, successes: 0, bonusValue: 0 };
  state.items.push(item);
  return item;
}
export function newProfile(balance = 100000): InventoryProfile {
  const inventory: InventoryState = { items: [], equipped: {}, outfits: OUTFITS.map(o => o.id), equippedOutfit: null, scrolls: { 10: 3, 60: 3, 90: 3 }, nextId: 1, demoGranted: false };
  for (const kind of ['sword', 'staff', 'bow', 'claw']) addWeapon(inventory, `${kind}-1`);
  return { version: 1, balance, inventory };
}
/** 驗證整份存檔；不接受重複 UID、未知外觀或非有限數字。 */
export function parseProfile(raw: string | null): InventoryProfile | null {
  try {
    const p = JSON.parse(raw ?? 'null') as InventoryProfile;
    const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
    if (!p || p.version !== 1 || !integer(p.balance)) return null;
    const s = p.inventory;
    if (!s || !Array.isArray(s.items) || s.items.length > BAG_CAPACITY || !integer(s.nextId) || s.nextId < 1 || typeof s.demoGranted !== 'boolean' || !s.equipped || !s.scrolls) return null;
    // Existing v1 saves receive the first outfit without resetting weapons, coins or scrolls.
    if (s.outfits === undefined && s.equippedOutfit === undefined) {
      s.outfits = OUTFITS.map(o => o.id); s.equippedOutfit = null;
    }
    if (!Array.isArray(s.outfits) || new Set(s.outfits).size !== s.outfits.length || s.outfits.some(id => !OUTFIT_BY_ID.has(id))) return null;
    if (s.equippedOutfit !== null && (typeof s.equippedOutfit !== 'string' || !s.outfits.includes(s.equippedOutfit))) return null;
    const ids = new Set<string>();
    for (const w of s.items) {
      if (!w || !/^weapon-\d+$/.test(w.uid) || Number(w.uid.slice(7)) >= s.nextId || ids.has(w.uid) || !WEAPON_BY_ID.has(w.definitionId) || !integer(w.slotsLeft) || !integer(w.successes) || w.slotsLeft + w.successes > UPGRADE_SLOTS || !integer(w.bonusValue) || w.bonusValue > w.successes * 5000) return null;
      ids.add(w.uid);
    }
    if (!SCROLL_RATES.every((r) => integer(s.scrolls[r]) && s.scrolls[r] <= 9999)) return null;
    for (const [classId, uid] of Object.entries(s.equipped)) {
      const w = s.items.find((item) => item.uid === uid);
      if (!w || WEAPON_BY_ID.get(w.definitionId)?.classId !== classId) return null;
    }
    return p;
  } catch { return null; }
}
export function inventoryAction(profile: InventoryProfile, action: InventoryAction, random: () => number, allowDemo = false): Omit<InventoryFeedback, 'id'> {
  const s = profile.inventory;
  const result = (kind: InventoryFeedback['kind'], message: string) => ({ kind, message });
  if (action.type === 'equipOutfit') {
    const outfit = OUTFIT_BY_ID.get(action.outfitId);
    if (!outfit || !s.outfits.includes(outfit.id)) return result('error', '尚未擁有這套套服。');
    s.equippedOutfit = outfit.id;
    return result('equipped', `已穿上${outfit.name}，所有職業共用。`);
  }
  if (action.type === 'unequipOutfit') {
    s.equippedOutfit = null;
    return result('equipped', '已換回森境旅人原裝。');
  }
  if (action.type === 'demoCollection') {
    if (!allowDemo || s.demoGranted) return result('error', '展示收藏只限開發模式領取一次。');
    const missing = WEAPONS.filter((d) => !s.items.some((w) => w.definitionId === d.id));
    if (s.items.length + missing.length > BAG_CAPACITY) return result('error', '背包空間不足，請先出售武器。');
    for (const d of missing) addWeapon(s, d.id);
    for (const r of SCROLL_RATES) s.scrolls[r] = Math.min(9999, s.scrolls[r] + 20);
    s.demoGranted = true;
    return result('bought', '已收下 40 款展示收藏與三種卷軸各 20 張。');
  }
  if (action.type === 'grantAllWeapons') {
    const missing = WEAPONS.filter((d) => !s.items.some((w) => w.definitionId === d.id));
    if (missing.length === 0) return result('bought', '40 款武器都已經在背包裡。');
    if (s.items.length + missing.length > BAG_CAPACITY) return result('error', `背包空間不足（還缺 ${missing.length} 款），請先出售武器。`);
    for (const d of missing) addWeapon(s, d.id);
    return result('bought', `已補上 ${missing.length} 款武器，40 款全數到齊。`);
  }
  if (action.type === 'grantScrolls') {
    const count = Number.isFinite(action.count) ? Math.max(0, Math.min(9999, Math.floor(action.count))) : 0;
    for (const r of SCROLL_RATES) s.scrolls[r] = Math.max(s.scrolls[r], count);
    return result('bought', `三種卷軸各補到 ${count.toLocaleString()} 張。`);
  }
  if (action.type === 'reset') {
    const fresh = newProfile();
    profile.balance = fresh.balance;
    profile.inventory = fresh.inventory;
    return result('bought', `已清空重置：金幣 ${fresh.balance.toLocaleString()}，背包、裝備與卷軸回到初始狀態。`);
  }
  if (action.type === 'buyScroll') {
    const rule = SCROLL_RULES[action.rate];
    if (!rule || profile.balance < rule.price || s.scrolls[action.rate] >= 9999) return result('error', '金幣不足或卷軸已達上限。');
    profile.balance -= rule.price;
    s.scrolls[action.rate]++;
    return result('bought', `購入 ${action.rate}% 武器卷軸。`);
  }
  if (action.type === 'unequip') {
    delete s.equipped[action.classId];
    return result('equipped', '已恢復職業原始武器外觀。');
  }
  const item = s.items.find((w) => w.uid === action.uid);
  if (!item) return result('error', '這把武器已不在背包內。');
  const def = WEAPON_BY_ID.get(item.definitionId)!;
  const remove = () => { s.items = s.items.filter((w) => w.uid !== item.uid); if (s.equipped[def.classId] === item.uid) delete s.equipped[def.classId]; };
  if (action.type === 'equip') {
    s.equipped[def.classId] = item.uid;
    return result('equipped', `已裝備 ${def.name}，切換對應職業即可看見。`);
  }
  if (action.type === 'sell') {
    if (s.equipped[def.classId] === item.uid) return result('error', '請先卸下武器，再交給商人。');
    const value = sellValue(item);
    remove(); profile.balance += value;
    return result('sold', `售出 ${def.name}，獲得 ${value.toLocaleString()} 金幣。`);
  }
  const rule = SCROLL_RULES[action.rate];
  if (!rule || item.slotsLeft <= 0 || s.scrolls[action.rate] <= 0) return result('error', '卷軸不足，或武器已用完強化機會。');
  s.scrolls[action.rate]--; item.slotsLeft--;
  if (random() < rule.success) {
    item.successes++; item.bonusValue += rule.bonus;
    return result('success', `強化成功！${def.name} 回收價增加 ${rule.bonus.toLocaleString()} 金幣。`);
  }
  if (random() < rule.breakOnFailure) {
    remove();
    return result('destroyed', `強化失敗，${def.name} 已損毀。${s.equipped[def.classId] ? '' : '可重新裝備其他武器。'}`);
  }
  return result('failed', '強化失敗，武器保留；消耗 1 次機會與 1 張卷軸。');
}
/** 真的放進背包的掉落物（畫面用：從哪隻怪身上掉出來、再飛到玩家身上）。 */
export type LootItem = { kind: 'weapon'; definitionId: string } | { kind: 'scroll'; rate: ScrollRate };

/** 額外掉落骰與戰鬥 resolveStrike 分開；不回饋任何戰鬥數值。回傳拾取訊息與放進背包的物品。 */
export function rollLootDrops(state: InventoryState, random: () => number): { messages: string[]; items: LootItem[] } {
  const messages: string[] = [];
  const items: LootItem[] = [];
  if (random() < DROP_RULES.weapon) {
    const def = WEAPONS[Math.min(WEAPONS.length - 1, Math.floor(random() * WEAPONS.length))]!;
    if (addWeapon(state, def.id)) { messages.push(def.name); items.push({ kind: 'weapon', definitionId: def.id }); }
    else messages.push('背包已滿，未能拾取武器');
  }
  if (random() < DROP_RULES.scroll) {
    const rate = SCROLL_RATES[Math.min(2, Math.floor(random() * 3))]!;
    if (state.scrolls[rate] < 9999) { state.scrolls[rate]++; messages.push(`${rate}% 武器卷軸`); items.push({ kind: 'scroll', rate }); }
  }
  return { messages, items };
}

export function rollLoot(state: InventoryState, random: () => number): string[] {
  return rollLootDrops(state, random).messages;
}
