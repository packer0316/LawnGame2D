import { describe, expect, it } from 'vitest';
import { ComboTracker, COMBO_WINDOW_MS, COMBO_EXIT_MS } from './ComboTracker';
describe('confirmed hit combo', () => {
  it('chains different attacks and multiple targets during the generous window', () => {
    const combo = new ComboTracker(); combo.hit(1); expect(combo.snapshot()).toBeUndefined();
    combo.step(5500); combo.hit(3);
    expect(combo.snapshot()).toMatchObject({ count: 4, remainingMs: COMBO_WINDOW_MS, beat: 2 });
    combo.step(5999); combo.hit(1); expect(combo.snapshot()?.count).toBe(5);
  });
  it('misses cannot refresh the timer, and exact timeout starts a new chain', () => {
    const combo = new ComboTracker(); combo.hit(5); combo.step(3000); combo.hit(0);
    expect(combo.snapshot()?.remainingMs).toBe(3000);
    combo.step(3000); expect(combo.snapshot()).toMatchObject({ count: 5, remainingMs: 0 });
    combo.hit(1); expect(combo.snapshot()).toBeUndefined(); combo.hit(1); expect(combo.snapshot()?.count).toBe(2);
  });
  it('fades out and invalidates old room/class replies on reset', () => {
    const combo = new ComboTracker(); combo.hit(10); combo.step(COMBO_WINDOW_MS + COMBO_EXIT_MS);
    expect(combo.snapshot()).toBeUndefined(); combo.hit(3); const generation = combo.generation;
    combo.reset(); expect(combo.snapshot()).toBeUndefined(); expect(combo.generation).toBe(generation + 1);
  });
});
