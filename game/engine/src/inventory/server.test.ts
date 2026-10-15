import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBundle } from '../content/bundle';
import { LocalServer } from '../server/LocalServer';

describe('inventory and wallet persistence', () => {
  const servers: LocalServer[] = [];
  let storage: Map<string, string>;
  const open = () => { const s = new LocalServer({} as ContentBundle); servers.push(s); return s; };
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  });
  afterEach(() => { for (const s of servers.splice(0)) s.dispose(); vi.unstubAllGlobals(); });
  it('migrates the old wallet once, then atomically saves sale and inventory', () => {
    storage.set('lawn.balance', '12345');
    const s = open(), uid = s.inventorySnapshot().inventory.items[0]!.uid;
    s.manageInventory({ type: 'sell', uid });
    const profile = JSON.parse(storage.get('lawn.balance.profile.v1')!);
    expect(profile.balance).toBe(13345); expect(profile.inventory.items).toHaveLength(3);
    storage.set('lawn.balance', '999999');
    const restored = open(); expect(restored.inventorySnapshot().inventory.items).toHaveLength(3);
    restored.manageInventory({ type: 'buyScroll', rate: 90 });
    expect(JSON.parse(storage.get('lawn.balance.profile.v1')!).balance).toBe(13045);
  });
  it('never replenishes a zero wallet on reload', () => {
    storage.set('lawn.balance', '300');
    open().manageInventory({ type: 'buyScroll', rate: 90 });
    const restored = open();
    expect(restored.manageInventory({ type: 'buyScroll', rate: 90 }).feedback?.kind).toBe('error');
    expect(JSON.parse(storage.get('lawn.balance.profile.v1')!).balance).toBe(0);
  });
  it('snapshots cannot mutate server ownership and failed storage is visible', () => {
    const server = open(); server.inventorySnapshot().inventory.items.length = 0;
    expect(server.inventorySnapshot().inventory.items).toHaveLength(4);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(server.manageInventory({ type: 'buyScroll', rate: 90 }).storageError).toBe(true);
  });
});
