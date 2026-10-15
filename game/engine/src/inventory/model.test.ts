import { describe, expect, it } from 'vitest';
import { BAG_CAPACITY, SCROLL_RATES, SCROLL_RULES, WEAPONS } from './catalog';
import { addWeapon, inventoryAction, newProfile, parseProfile, rollLoot, sellValue } from './model';

describe('cosmetic weapon economy', () => {
  it('adds the hood outfit to a ninja save and switches costumes without affecting weapons or money', () => {
    const old = newProfile(54321);
    old.inventory.outfits = ['ninja-1']; old.inventory.equippedOutfit = 'ninja-1';
    old.inventory.equipped.warrior = old.inventory.items[0]!.uid;
    const p = parseProfile(JSON.stringify(old))!;
    expect(p.inventory.outfits).toEqual(['ninja-1', 'hood-1']);
    expect(p.inventory.equippedOutfit).toBe('ninja-1');
    const before = structuredClone(p);
    for (const outfitId of ['hood-1', 'ninja-1', 'hood-1']) {
      expect(inventoryAction(p, {type:'equipOutfit',outfitId}, () => { throw Error('Costumes never roll'); }).kind).toBe('equipped');
      expect(parseProfile(JSON.stringify(p))?.inventory.equippedOutfit).toBe(outfitId);
    }
    expect({...p.inventory, equippedOutfit: before.inventory.equippedOutfit}).toEqual(before.inventory);
    expect(p.balance).toBe(before.balance);
  });
  it('migrates existing saves without changing weapons or currency, and persists the shared outfit', () => {
    const p = newProfile(12345);
    inventoryAction(p, {type:'equip',uid:p.inventory.items[0]!.uid}, () => 0);
    const old = JSON.parse(JSON.stringify(p)); delete old.inventory.outfits; delete old.inventory.equippedOutfit;
    const migrated = parseProfile(JSON.stringify(old))!;
    expect(migrated).toEqual(p);
    const weaponState = JSON.stringify({items:migrated.inventory.items,equipped:migrated.inventory.equipped,scrolls:migrated.inventory.scrolls,balance:migrated.balance});
    expect(inventoryAction(migrated,{type:'equipOutfit',outfitId:'ninja-1'},()=>{throw new Error('No combat/economy roll for clothes');}).kind).toBe('equipped');
    expect(parseProfile(JSON.stringify(migrated))?.inventory.equippedOutfit).toBe('ninja-1');
    expect(JSON.stringify({items:migrated.inventory.items,equipped:migrated.inventory.equipped,scrolls:migrated.inventory.scrolls,balance:migrated.balance})).toBe(weaponState);
    inventoryAction(migrated,{type:'unequipOutfit'},()=>0); expect(migrated).toEqual(p);
  });
  it('rejects unknown, duplicate or unowned outfits without changing a valid profile', () => {
    const p = newProfile(), before=JSON.stringify(p);
    expect(inventoryAction(p,{type:'equipOutfit',outfitId:'missing'},()=>0).kind).toBe('error');
    expect(JSON.stringify(p)).toBe(before);
    p.inventory.outfits=[];
    expect(inventoryAction(p,{type:'equipOutfit',outfitId:'ninja-1'},()=>0).kind).toBe('error');
    p.inventory.equippedOutfit='ninja-1'; expect(parseProfile(JSON.stringify(p))).toBeNull();
    p.inventory.outfits=['ninja-1','ninja-1']; expect(parseProfile(JSON.stringify(p))).toBeNull();
  });
  it('has ten distinct skins per class with no combat modifiers', () => {
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(40);
    for (const c of ['warrior', 'mage', 'archer', 'assassin']) expect(WEAPONS.filter((w) => w.classId === c)).toHaveLength(10);
    for (const d of WEAPONS) expect(Object.keys(d).sort()).toEqual(['classId', 'description', 'frame', 'id', 'kind', 'name']);
  });
  for (const rate of SCROLL_RATES) {
    it(`${rate}% success increases resale only and consumes exactly one slot / scroll`, () => {
      const p = newProfile(), w = p.inventory.items[0]!, before = p.balance;
      const out = inventoryAction(p, { type: 'upgrade', uid: w.uid, rate }, () => 0);
      expect(out.kind).toBe('success'); expect(w.slotsLeft).toBe(6); expect(w.successes).toBe(1);
      expect(sellValue(w)).toBe(1000 + SCROLL_RULES[rate].bonus); expect(p.inventory.scrolls[rate]).toBe(2); expect(p.balance).toBe(before);
    });
    it(`${rate}% failed upgrade preserves the weapon outside the conditional destruction range`, () => {
      const p = newProfile(), w = p.inventory.items[0]!;
      const out = inventoryAction(p, { type: 'upgrade', uid: w.uid, rate }, () => .999);
      expect(out.kind).toBe('failed'); expect(w.slotsLeft).toBe(6); expect(w.successes).toBe(0); expect(sellValue(w)).toBe(1000);
    });
    it(`${rate}% failure can destroy an equipped weapon and clears its appearance`, () => {
      const p = newProfile(), w = p.inventory.items[0]!;
      inventoryAction(p, { type: 'equip', uid: w.uid }, () => 0);
      const rolls = [.999, SCROLL_RULES[rate].breakOnFailure - .0001];
      expect(inventoryAction(p, { type: 'upgrade', uid: w.uid, rate }, () => rolls.shift()!).kind).toBe('destroyed');
      expect(p.inventory.items.some((i) => i.uid === w.uid)).toBe(false); expect(p.inventory.equipped.warrior).toBeUndefined();
      expect(p.inventory.scrolls[rate]).toBe(2);
    });
  }
  it('blocks sale while equipped and cannot pay twice for a sold weapon', () => {
    const p = newProfile(), w = p.inventory.items[0]!;
    inventoryAction(p, { type: 'upgrade', uid: w.uid, rate: 10 }, () => 0);
    inventoryAction(p, { type: 'equip', uid: w.uid }, () => 0);
    expect(inventoryAction(p, { type: 'sell', uid: w.uid }, () => 0).kind).toBe('error');
    inventoryAction(p, { type: 'unequip', classId: 'warrior' }, () => 0);
    expect(inventoryAction(p, { type: 'sell', uid: w.uid }, () => 0).kind).toBe('sold'); expect(p.balance).toBe(106000);
    expect(inventoryAction(p, { type: 'sell', uid: w.uid }, () => 0).kind).toBe('error'); expect(p.balance).toBe(106000);
  });
  it('enforces seven slots and leaves profile unchanged on rejected operations', () => {
    const p = newProfile(), w = p.inventory.items[0]!; p.inventory.scrolls[90] = 20;
    for (let i = 0; i < 7; i++) inventoryAction(p, { type: 'upgrade', uid: w.uid, rate: 90 }, () => 0);
    const before = JSON.stringify(p);
    expect(inventoryAction(p, { type: 'upgrade', uid: w.uid, rate: 90 }, () => 0).kind).toBe('error'); expect(JSON.stringify(p)).toBe(before);
    expect(sellValue(w)).toBe(3100);
  });
  it('buying the last affordable scroll preserves a zero wallet across save/load', () => {
    const p = newProfile(300);
    inventoryAction(p, { type: 'buyScroll', rate: 90 }, () => 0);
    expect(p.balance).toBe(0); expect(parseProfile(JSON.stringify(p))).toEqual(p);
    const before = JSON.stringify(p);
    expect(inventoryAction(p, { type: 'buyScroll', rate: 90 }, () => 0).kind).toBe('error'); expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects duplicate IDs, invalid slots, incompatible equipment and invalid balances', () => {
    const p = newProfile(); p.inventory.items.push({ ...p.inventory.items[0]! }); expect(parseProfile(JSON.stringify(p))).toBeNull();
    p.inventory.items.pop(); p.inventory.items[0]!.slotsLeft = 8; expect(parseProfile(JSON.stringify(p))).toBeNull();
    p.inventory.items[0]!.slotsLeft = 7; p.inventory.equipped.mage = p.inventory.items[0]!.uid; expect(parseProfile(JSON.stringify(p))).toBeNull();
    delete p.inventory.equipped.mage; p.balance = -1; expect(parseProfile(JSON.stringify(p))).toBeNull();
  });
  it('demo grant is guarded and one time; normal loot obeys bag capacity', () => {
    const p = newProfile();
    expect(inventoryAction(p, { type: 'demoCollection' }, () => 0).kind).toBe('error');
    inventoryAction(p, { type: 'demoCollection' }, () => 0, true); expect(p.inventory.items).toHaveLength(40);
    expect(inventoryAction(p, { type: 'demoCollection' }, () => 0, true).kind).toBe('error');
    while (p.inventory.items.length < BAG_CAPACITY) addWeapon(p.inventory, 'sword-1');
    expect(rollLoot(p.inventory, () => 0)).toHaveLength(2); expect(p.inventory.items).toHaveLength(BAG_CAPACITY); expect(p.inventory.scrolls[10]).toBe(24);
    expect(parseProfile(JSON.stringify(p))).toEqual(p);
  });
});

describe('設定面板的測試工具', () => {
  it('獲得所有武器：每款補一把、不重複，可以重複按；背包放不下就不加', () => {
    const p = newProfile();
    expect(inventoryAction(p, { type: 'grantAllWeapons' }, () => 0).kind).toBe('bought');
    expect(new Set(p.inventory.items.map((w) => w.definitionId)).size).toBe(40); expect(p.inventory.items).toHaveLength(40);
    inventoryAction(p, { type: 'grantAllWeapons' }, () => 0); expect(p.inventory.items).toHaveLength(40);
    expect(parseProfile(JSON.stringify(p))).toEqual(p);
    const full = newProfile();
    while (full.inventory.items.length < BAG_CAPACITY) addWeapon(full.inventory, 'sword-1');
    const before = JSON.stringify(full);
    expect(inventoryAction(full, { type: 'grantAllWeapons' }, () => 0).kind).toBe('error'); expect(JSON.stringify(full)).toBe(before);
  });
  it('卷軸各補到指定張數：不減少原本較多的，上限 9999，壞掉的數字不會弄壞存檔', () => {
    const p = newProfile(); p.inventory.scrolls[90] = 1500;
    inventoryAction(p, { type: 'grantScrolls', count: 999 }, () => 0);
    expect(p.inventory.scrolls).toEqual({ 10: 999, 60: 999, 90: 1500 });
    inventoryAction(p, { type: 'grantScrolls', count: 1e9 }, () => 0); expect(p.inventory.scrolls[10]).toBe(9999);
    inventoryAction(p, { type: 'grantScrolls', count: Number.NaN }, () => 0); expect(p.inventory.scrolls[10]).toBe(9999);
    expect(parseProfile(JSON.stringify(p))).toEqual(p);
  });
  it('清空重置：金幣、背包、裝備、卷軸回到初始狀態', () => {
    const p = newProfile(5);
    inventoryAction(p, { type: 'grantAllWeapons' }, () => 0);
    inventoryAction(p, { type: 'grantScrolls', count: 999 }, () => 0);
    inventoryAction(p, { type: 'equip', uid: p.inventory.items[0]!.uid }, () => 0);
    inventoryAction(p, { type: 'reset' }, () => 0);
    expect(p).toEqual(newProfile());
  });
});

describe('掉落物明細（畫面播放掉落用）', () => {
  it('rollLootDrops 的物品跟拾取訊息一致，亂數順序跟 rollLoot 相同', async () => {
    const { rollLoot, rollLootDrops, newProfile } = await import('./model');
    const { seededRandom } = await import('@lawn/shared');
    for (let seed = 1; seed <= 300; seed += 1) {
      const a = newProfile().inventory;
      const b = newProfile().inventory;
      const messages = rollLoot(a, seededRandom(seed));
      const drop = rollLootDrops(b, seededRandom(seed));
      expect(drop.messages).toEqual(messages);
      expect(b).toEqual(a);
      const added = drop.messages.filter((m) => !m.startsWith('背包已滿'));
      expect(drop.items.length).toBe(added.length);
    }
  });
});
