import { afterEach, describe, expect, it } from 'vitest';
import { connectNet } from './transport';

/** 假的平台大廳：所有看這個頁面的人共用一份 presence 清單，每個人看到的 sameTab 只有自己。 */
class FakePlatform {
  private readonly presence = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Set<() => void>();
  claude(peer: string, permission: 'granted' | 'prompt' | 'denied' = 'granted', answer: 'granted' | 'denied' = 'granted') {
    this.presence.set(peer, {});
    const room = {
      presence: async (patch: Record<string, unknown>) => {
        const next = { ...this.presence.get(peer) };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        this.presence.set(peer, next);
        for (const listener of this.listeners) listener();
      },
      peers: () => [...this.presence].map(([p, presence]) => ({ peer: p, by: `user-${p}`, sameTab: p === peer, presence })),
      onPeers: (handler: () => void) => {
        this.listeners.add(handler);
        return () => this.listeners.delete(handler);
      },
    };
    let state: string = permission;
    const permissions = {
      state: async () => state,
      request: async () => {
        state = answer;
        return { room: answer, user: answer };
      },
      manage: async () => undefined,
    };
    const user = { profiles: async (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, { name: `名字-${id}` }])) };
    return { use: async (name: string) => (name === 'room' ? room : name === 'permissions' ? permissions : name === 'user' ? user : null) };
  }
}

const g = globalThis as { claude?: unknown };
afterEach(() => {
  delete g.claude;
});

describe('claude.ai 多人連線（大廳＋遊戲房標記）', () => {
  it('只看到同一間遊戲房的人；presence 都帶上房號', async () => {
    const platform = new FakePlatform();
    const connect = async (peer: string) => {
      g.claude = platform.claude(peer);
      return (await connectNet(new URLSearchParams())).lobby!;
    };
    const a = await (await connect('a')).join('room-1');
    const b = await (await connect('b')).join('room-1');
    const c = await (await connect('c')).join('room-2');
    a!.setPresence({ v: 1 });
    b!.setPresence({ v: 1 });
    c!.setPresence({ v: 1 });
    expect(a!.peers().map((p) => [p.peer, p.isMe])).toEqual([['a', true], ['b', false]]);
    expect(c!.peers().map((p) => p.peer)).toEqual(['c']);
    expect(b!.peers().find((p) => p.peer === 'a')?.presence).toMatchObject({ r: 'room-1', v: 1 });
    // 離開遊戲房：自己的遊戲欄位清掉，別人就看不到
    a!.leave();
    expect(b!.peers().map((p) => p.peer)).toEqual(['b']);
  });

  it('第一次會先問權限；答應就連上，拒絕就單人並回報 denied', async () => {
    const platform = new FakePlatform();
    g.claude = platform.claude('a', 'prompt', 'granted');
    expect((await connectNet(new URLSearchParams())).status).toBe('on');
    g.claude = platform.claude('b', 'prompt', 'denied');
    const denied = await connectNet(new URLSearchParams());
    expect(denied.status).toBe('denied');
    expect(denied.lobby).toBeNull();
    expect(typeof denied.managePermissions).toBe('function');
  });

  it('沒有平台（本機開發）就是單人', async () => {
    expect(await connectNet(new URLSearchParams())).toMatchObject({ lobby: null, status: 'off' });
  });

  it('玩家名稱從平台的使用者資料來', async () => {
    const platform = new FakePlatform();
    g.claude = platform.claude('a');
    const lobby = (await connectNet(new URLSearchParams())).lobby!;
    expect(await lobby.nameOf('user-b', 'b')).toBe('名字-user-b');
  });
});
