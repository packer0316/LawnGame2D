import { describe, expect, it } from 'vitest';
import { MAX_NET_MOBS, NET_VERSION, currentHost, decodeWorld, encodeWorld, nextHost, readPlayer, type NetMob, type NetPeer } from './protocol';

const mob = (uid: number, over: Partial<NetMob> = {}): NetMob => ({ uid, type: 'mob_0201', zone: 'zone-a', x: 100.4, y: 480, facing: 1, state: 1, multiplier: 12, ...over });
const peer = (name: string, presence: Record<string, unknown>): NetPeer => ({ peer: name, isMe: false, by: null, presence });

describe('多人連線協定', () => {
  it('怪物世界編碼後解碼回原樣（位置取整）', () => {
    const world = { mobs: [mob(1), mob(2, { type: 'mob_0202', zone: 'zone-b', facing: -1, state: 2, x: 5.6 }), mob(3, { state: 0 })], dead: [[9, 'peer-b']] as [number, string][] };
    const decoded = decodeWorld(JSON.parse(JSON.stringify(encodeWorld(world))));
    expect(decoded?.dead).toEqual([[9, 'peer-b']]);
    expect(decoded?.mobs).toEqual([
      { ...mob(1), x: 100 },
      { ...mob(2, { type: 'mob_0202', zone: 'zone-b', facing: -1, state: 2 }), x: 6 },
      { ...mob(3, { state: 0 }), x: 100 },
    ]);
  });

  it('一間房最多的怪也放得進 4 KiB 的 presence', () => {
    const mobs = Array.from({ length: 200 }, (_, i) => mob(100000 + i, { x: 1439.6, y: 479.4, multiplier: 300, type: `mob_02${i % 4}0`, zone: `zone-${'x'.repeat(30)}-${i % 3}` }));
    const encoded = encodeWorld({ mobs, dead: Array.from({ length: 10 }, (_, i) => [i, 'k3v6q2rt7wacd4fn'] as [number, string]) });
    expect(encoded.m).toHaveLength(MAX_NET_MOBS);
    const presence = { v: NET_VERSION, w: encoded, h: Date.now(), k: [], p: { x: 1000, y: 480, f: 1, a: 'swing1', m: 'warrior_whirl', ms: 12, c: 'warrior', cw: 'weapon_def_0001', o: 'outfit_hood' } };
    expect(new TextEncoder().encode(JSON.stringify(presence)).length).toBeLessThan(4096);
  });

  it('壞掉或別的版本的資料不採用', () => {
    expect(decodeWorld(null)).toBeNull();
    expect(decodeWorld({ t: [], z: [], m: [['x']] })?.mobs).toEqual([]);
    expect(readPlayer({ x: 'a', y: 1, a: 'stand', c: 'warrior' })).toBeNull();
    expect(readPlayer({ x: 1, y: 2, f: 1, a: 'run', c: 'mage', m: 3 })).toMatchObject({ m: null, cw: null, o: null });
  });

  it('主機：最早宣告的那位；同時宣告比 peer', () => {
    const peers = [peer('b', { v: 1, h: 200 }), peer('c', { v: 1, h: 100 }), peer('a', { v: 1, h: 100 }), peer('d', { v: 1 })];
    expect(currentHost(peers)).toBe('a');
    expect(currentHost([peer('a', { v: 1 }), peer('b', { v: 2, h: 1 })])).toBeNull();
  });

  it('沒有主機時：已進入遊戲、標籤最小的人出來當', () => {
    const peers = [peer('m', { v: 1, p: { x: 0, y: 0, a: 'stand', c: 'warrior' } }), peer('a', { v: 1 }), peer('k', { v: 1, p: { x: 0, y: 0, a: 'run', c: 'mage' } })];
    expect(nextHost(peers)).toBe('k');
  });
});
