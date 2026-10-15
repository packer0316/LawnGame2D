import { describe, expect, it } from 'vitest';
import { BAG_CAPACITY, SCROLL_RATES, SCROLL_RULES, WEAPONS } from './catalog';
import { addWeapon, inventoryAction, newProfile, parseProfile, rollLoot, sellValue } from './model';

describe('cosmetic weapon economy', () => {
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
