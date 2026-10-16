import type { NetPeer } from './protocol';

/**
 * 連線通道：同一間遊戲房（地圖）的玩家，各自有一份 presence。
 * 兩種實作：claude.ai Artifact 的 room 能力（正式），以及同一個瀏覽器分頁之間的 BroadcastChannel（本機測試，網址加 ?net=local）。
 */
export interface NetChannel {
  readonly name: string;
  /** 合併進自己的 presence（null 刪掉欄位）；送不出去就算了（下一次會再送絕對狀態） */
  setPresence(patch: Record<string, unknown>): void;
  /** 目前在這間房的所有人（含自己，isMe） */
  peers(): readonly NetPeer[];
  onPeers(handler: () => void): () => void;
  leave(): void;
}

export interface NetLobby {
  readonly kind: 'claude' | 'local';
  join(name: string): Promise<NetChannel | null>;
  /** 玩家顯示名稱（平台的使用者資料）；查不到回傳空字串 */
  nameOf(by: string | null, peer: string): Promise<string>;
}

interface ClaudeGlobal {
  use?: (name: string) => Promise<unknown>;
}

/** 多人連線狀態：on = 已連上；denied = 玩家拒絕（或之前拒絕過）多人連線的權限；off = 沒有平台（本機開發）或平台不提供。 */
export type NetStatus = 'on' | 'denied' | 'off';

export interface NetConnection {
  lobby: NetLobby | null;
  status: NetStatus;
  /** 打開平台的權限面板（被拒絕時讓玩家自己打開）；結束後回傳新的狀態 */
  managePermissions?: () => Promise<NetStatus>;
}

interface ClaudePermissions {
  state(name: string): Promise<string>;
  request(names: readonly string[]): Promise<Record<string, string>>;
  manage(): Promise<void>;
}

/**
 * 連上多人連線。本機開發沒有平台時 lobby = null（單人）。
 * 每個能力第一次用時平台才會問玩家：這裡一開始就批次問一次（房間 + 玩家名稱），被拒絕就單人並回報 denied。
 */
export async function connectNet(params: URLSearchParams = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)): Promise<NetConnection> {
  if (params.get('net') === 'local' && typeof BroadcastChannel !== 'undefined') return { lobby: new LocalLobby(), status: 'on' };
  const claude = (globalThis as { claude?: ClaudeGlobal }).claude;
  if (typeof claude?.use !== 'function') return { lobby: null, status: 'off' };
  const use = claude.use.bind(claude);
  const permissions = (await use('permissions').catch(() => null)) as ClaudePermissions | null;
  const open = async (): Promise<NetConnection> => {
    let state = (await permissions?.state('room').catch(() => 'granted')) ?? 'granted';
    if (state === 'prompt') state = (await permissions!.request(['room', 'user']).catch(() => ({ room: 'denied' })))['room'] ?? 'denied';
    if (state === 'denied') return { lobby: null, status: 'denied', managePermissions: manage };
    const room = (await use('room').catch(() => null)) as ClaudeRoom | null;
    if (!room) return { lobby: null, status: 'off' };
    const user = (await use('user').catch(() => null)) as ClaudeUser | null;
    return { lobby: new ClaudeLobby(room, user), status: 'on' };
  };
  const manage = async (): Promise<NetStatus> => {
    await permissions?.manage().catch(() => undefined);
    return (await permissions?.state('room').catch(() => 'denied')) === 'denied' ? 'denied' : 'on';
  };
  try {
    return await open();
  } catch {
    return { lobby: null, status: 'off' };
  }
}

// ---------------------------------------------------------------- claude.ai Artifact

interface ClaudePeer {
  peer: string;
  by: string | null;
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
}
interface ClaudeRoom {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly ClaudePeer[];
  onPeers(handler: () => void, onError?: (e: { code: string }) => void): () => void;
}
interface ClaudeUser {
  profiles(ids: readonly string[]): Promise<Record<string, { name: string }>>;
}

/** 自己 presence 裡遊戲用的欄位（離開遊戲房時全部清掉） */
const GAME_FIELDS = ['r', 'v', 'p', 'h', 'k', 'w', 's'] as const;

/**
 * 用平台的大廳（看這個頁面的所有人）而不是命名房間：命名房間不一定開放給只有檢視權限的人。
 * 每個人在 presence 的 r 標記自己在哪一間遊戲房，這裡只回傳同一間的人。
 */
class ClaudeLobby implements NetLobby {
  readonly kind = 'claude';
  /** 目前所在的遊戲房（同時只會在一間） */
  private current: string | null = null;

  constructor(
    private readonly room: ClaudeRoom,
    private readonly user: ClaudeUser | null,
  ) {}

  async join(name: string): Promise<NetChannel | null> {
    this.current = name;
    const room = this.room;
    void room.presence({ r: name }).catch(() => undefined);
    let cached: { from: readonly ClaudePeer[]; to: NetPeer[] } | null = null;
    return {
      name,
      // 每次都帶上 r：平台訊息可能掉，新來的人也要知道你在哪一間
      setPresence: (patch) => {
        if (this.current === name) void room.presence({ ...patch, r: name }).catch(() => undefined);
      },
      peers: () => {
        const raw = room.peers();
        // 同一份快照就回傳同一個陣列（平台保證沒變的話是同一個物件）
        if (cached?.from !== raw) {
          cached = {
            from: raw,
            to: raw.filter((p) => p.sameTab || p.presence.r === name).map((p) => ({ peer: p.peer, isMe: p.sameTab, by: p.by, presence: p.presence as Record<string, unknown> })),
          };
        }
        return cached.to;
      },
      onPeers: (handler) => room.onPeers(() => handler(), () => handler()),
      leave: () => {
        if (this.current !== name) return;
        this.current = null;
        void room.presence(Object.fromEntries(GAME_FIELDS.map((key) => [key, null]))).catch(() => undefined);
      },
    };
  }

  async nameOf(by: string | null): Promise<string> {
    if (!by || !this.user) return '';
    try {
      return (await this.user.profiles([by]))[by]?.name ?? '';
    } catch {
      return '';
    }
  }
}

// ---------------------------------------------------------------- 本機測試：分頁之間

const LOCAL_TIMEOUT_MS = 3000;

type LocalMessage = { type: 'presence'; peer: string; presence: Record<string, unknown> } | { type: 'leave'; peer: string } | { type: 'hello'; peer: string };

class LocalLobby implements NetLobby {
  readonly kind = 'local';
  private readonly self = `local-${Math.random().toString(36).slice(2, 10)}`;

  async join(name: string): Promise<NetChannel> {
    const bc = new BroadcastChannel(`lawn-net-${name}`);
    const others = new Map<string, { presence: Record<string, unknown>; at: number }>();
    let mine: Record<string, unknown> = {};
    let snapshot: NetPeer[] = [];
    const handlers = new Set<() => void>();
    const rebuild = () => {
      const now = Date.now();
      for (const [peer, entry] of others) if (now - entry.at > LOCAL_TIMEOUT_MS) others.delete(peer);
      snapshot = [{ peer: this.self, isMe: true, by: null, presence: mine }, ...[...others].map(([peer, entry]) => ({ peer, isMe: false, by: null, presence: entry.presence }))];
      for (const handler of handlers) handler();
    };
    let closed = false;
    const send = (message: LocalMessage) => {
      if (!closed) bc.postMessage(message);
    };
    bc.onmessage = (event: MessageEvent<LocalMessage>) => {
      const message = event.data;
      if (message.type === 'leave') others.delete(message.peer);
      else if (message.type === 'hello') send({ type: 'presence', peer: this.self, presence: mine });
      else others.set(message.peer, { presence: message.presence, at: Date.now() });
      rebuild();
    };
    // 心跳：沒變也每秒送一次，關掉的分頁 3 秒後消失
    const heartbeat = setInterval(() => {
      send({ type: 'presence', peer: this.self, presence: mine });
      rebuild();
    }, 1000);
    const leave = () => {
      if (closed) return;
      clearInterval(heartbeat);
      send({ type: 'leave', peer: this.self });
      closed = true;
      bc.close();
      window.removeEventListener('pagehide', leave);
    };
    window.addEventListener('pagehide', leave);
    send({ type: 'hello', peer: this.self });
    rebuild();
    return {
      name,
      setPresence: (patch) => {
        const next = { ...mine };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) delete next[key];
          else next[key] = value;
        }
        mine = next;
        send({ type: 'presence', peer: this.self, presence: mine });
        rebuild();
      },
      peers: () => snapshot,
      onPeers: (handler) => {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
      leave,
    };
  }

  async nameOf(_by: string | null, peer: string): Promise<string> {
    return `玩家 ${peer.slice(-4)}`;
  }
}
