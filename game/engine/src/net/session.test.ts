import { describe, expect, it } from 'vitest';
import type { NetMob, NetPeer, PlayerState } from './protocol';
import { HOST_GRACE_MS, MultiplayerSession, type NetRole } from './session';
import type { NetChannel, NetLobby } from './transport';

/** 假的房間：所有人的 presence 放在一起，任何人改了就通知大家。 */
class FakeHub {
  readonly presence = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Map<string, Set<() => void>>();
  lobby(peer: string): NetLobby {
    return {
      kind: 'local',
      nameOf: async () => peer,
      join: async (name): Promise<NetChannel> => {
        this.presence.set(peer, {});
        const set = new Set<() => void>();
        this.listeners.set(peer, set);
        this.notify();
        return {
          name,
          setPresence: (patch) => {
            const next = { ...this.presence.get(peer) };
            for (const [k, v] of Object.entries(patch)) {
              if (v === null) delete next[k];
              else next[k] = v;
            }
            this.presence.set(peer, next);
            this.notify();
          },
          peers: () => [...this.presence].map(([p, presence]): NetPeer => ({ peer: p, isMe: p === peer, by: null, presence })),
          onPeers: (handler) => {
            set.add(handler);
            return () => set.delete(handler);
          },
          leave: () => {
            this.presence.delete(peer);
            this.listeners.delete(peer);
            this.notify();
          },
        };
      },
    };
  }
  private notify(): void {
    for (const set of [...this.listeners.values()]) for (const handler of [...set]) handler();
  }
}

const player: PlayerState = { x: 10, y: 480, f: 1, a: 'stand', m: null, ms: 0, c: 'warrior', cw: null, o: null };
const mob = (uid: number): NetMob => ({ uid, type: 'mob_0201', zone: 'z1', x: uid * 10, y: 480, facing: 1, state: 0, multiplier: 5 });

function setup(hub: FakeHub, peer: string, clock: { t: number }) {
  const roles: NetRole[] = [];
  const worlds: number[][] = [];
  const kills: [number, string][] = [];
  const session = new MultiplayerSession(hub.lobby(peer), {
    onRole: (role) => roles.push(role),
    onWorld: (world) => worlds.push(world.mobs.map((m) => m.uid)),
    onRemoteKill: (uid, by) => kills.push([uid, by]),
  }, () => clock.t);
  return { session, roles, worlds, kills };
}

describe('多人連線：主機與跟隨者', () => {
  it('第一個進房的人等一下沒看到主機就自己當；後來的人跟隨並收到怪物世界', async () => {
    const hub = new FakeHub();
    const clock = { t: 1000 };
    const a = setup(hub, 'peer-a', clock);
    await a.session.enter('room-1');
    a.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(a.session.role).toBe('pending');
    clock.t += HOST_GRACE_MS + 10;
    a.session.tick(player, () => ({ mobs: [mob(1), mob(2)], dead: [] }));
    expect(a.session.role).toBe('host');

    const b = setup(hub, 'peer-b', clock);
    await b.session.enter('room-1');
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(b.session.role).toBe('follower');
    expect(b.worlds.at(-1)).toEqual([1, 2]);
    expect(b.session.remotePlayers().map((p) => p.peer)).toEqual(['peer-a']);
    expect(a.session.online).toBe(2);
  });

  it('跟隨者打死怪：主機收到一次宣告；主機記錄死亡後跟隨者知道是誰打死的', async () => {
    const hub = new FakeHub();
    const clock = { t: 1000 };
    const a = setup(hub, 'peer-a', clock);
    await a.session.enter('room-1');
    clock.t += HOST_GRACE_MS + 10;
    a.session.tick(player, () => ({ mobs: [mob(1), mob(2)], dead: [] }));
    const b = setup(hub, 'peer-b', clock);
    await b.session.enter('room-1');
    b.session.claimKill(2);
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    a.session.tick(player, () => ({ mobs: [mob(1)], dead: [] }));
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(a.kills).toEqual([[2, 'peer-b']]);
    a.session.recordDeath(2, 'peer-b');
    clock.t += 100;
    a.session.tick(player, () => ({ mobs: [mob(1)], dead: [] }));
    expect(b.worlds.at(-1)).toEqual([1]);
    expect((hub.presence.get('peer-a')!.w as { d: unknown }).d).toEqual([[2, 'peer-b']]);
  });

  it('主機離開：剩下的人裡標籤最小的接手', async () => {
    const hub = new FakeHub();
    const clock = { t: 1000 };
    const a = setup(hub, 'peer-a', clock);
    await a.session.enter('room-1');
    clock.t += HOST_GRACE_MS + 10;
    a.session.tick(player, () => ({ mobs: [mob(1)], dead: [] }));
    const c = setup(hub, 'peer-c', clock);
    const b = setup(hub, 'peer-b', clock);
    await c.session.enter('room-1');
    await b.session.enter('room-1');
    c.session.tick(player, () => ({ mobs: [], dead: [] }));
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect([b.session.role, c.session.role]).toEqual(['follower', 'follower']);

    a.session.dispose();
    clock.t += HOST_GRACE_MS + 10;
    c.session.tick(player, () => ({ mobs: [], dead: [] }));
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    c.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(b.session.role).toBe('host');
    expect(c.session.role).toBe('follower');
  });

  it('主機切到背景就交出去，回來變跟隨者', async () => {
    const hub = new FakeHub();
    const clock = { t: 1000 };
    const a = setup(hub, 'peer-a', clock);
    const b = setup(hub, 'peer-b', clock);
    await a.session.enter('room-1');
    await b.session.enter('room-1');
    clock.t += HOST_GRACE_MS + 10;
    a.session.tick(player, () => ({ mobs: [], dead: [] }));
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(a.session.role).toBe('host');
    a.session.setAway(true);
    b.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(b.session.role).toBe('host');
    a.session.setAway(false);
    a.session.tick(player, () => ({ mobs: [], dead: [] }));
    expect(a.session.role).toBe('follower');
  });
});
