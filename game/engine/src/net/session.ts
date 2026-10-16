import { NET_VERSION, currentHost, decodeWorld, encodeWorld, nextHost, readCasts, readPlayer, readPresence, type NetCast, type NetPeer, type NetWorld, type PlayerState } from './protocol';
import type { NetChannel, NetLobby } from './transport';

/**
 * 多人連線的遊戲端（SPEC §5.5）：一間遊戲房（地圖）一個通道。
 *
 * - solo：沒有連線（或通道失敗），自己生怪；pending：剛進房，等一下看有沒有主機
 * - host：負責生怪與怪物 AI，把怪物世界放進 presence；確認別人打死的怪
 * - follower：怪物照主機的世界；自己打死的怪先放進 presence 的 k，等主機確認
 *
 * 錢包與擊殺機率永遠在自己這裡算（每個人的押注各自結算）。同一隻怪兩個人幾乎同時打死時，兩邊都已經派彩；
 * 主機只採用第一個，畫面上那隻怪就消失。Demo 接受這個誤差。
 */
export type NetRole = 'solo' | 'pending' | 'host' | 'follower';

export interface RemotePlayer {
  peer: string;
  by: string | null;
  state: PlayerState;
  /** 最近放的技能（序號遞增） */
  casts: NetCast[];
}

export interface SessionHandlers {
  /** 角色改變（變成主機要開始生怪、變成跟隨者要交出怪物 AI） */
  onRole(role: NetRole): void;
  /** 跟隨者：主機的怪物世界更新了 */
  onWorld(world: NetWorld): void;
  /** 主機：別的玩家說他打死了這隻 */
  onRemoteKill(uid: number, peer: string): void;
}

/** 剛進房先等多久看有沒有主機（平台的成員名單一兩秒內陸續到） */
export const HOST_GRACE_MS = 1500;
/** 打死的怪、等主機確認的宣告，留多久 */
const CLAIM_TTL_MS = 5000;
const DEAD_TTL_MS = 3000;
/** 放的技能留在 presence 多久（別人每 ~100ms 收一次，太久的不重播） */
const CAST_TTL_MS = 2000;

export class MultiplayerSession {
  role: NetRole = 'solo';
  private channel: NetChannel | null = null;
  private unsubscribe: (() => void) | null = null;
  private joinedAt = 0;
  private hostSince: number | null = null;
  private claims: [number, number][] = [];
  private dead: { uid: number; peer: string; at: number }[] = [];
  private casts: NetCast[] = [];
  private castSeq = 0;
  private readonly handled = new Map<string, number>();
  private lastWorld: unknown = null;
  private lastSent = '';
  private away = false;
  private entering = 0;

  constructor(
    readonly lobby: NetLobby,
    private readonly handlers: SessionHandlers,
    private readonly now: () => number = Date.now,
  ) {}

  /** 自己在通道裡的標籤 */
  get selfPeer(): string | null {
    return this.channel?.peers().find((p) => p.isMe)?.peer ?? null;
  }

  /** 這間房目前的人數（含自己） */
  get online(): number {
    return this.channel ? Math.max(1, this.channel.peers().length) : 1;
  }

  /** 進一間遊戲房（換房時呼叫）：離開舊通道、加入新的，先進入 pending。 */
  async enter(room: string): Promise<void> {
    const ticket = ++this.entering;
    this.leaveChannel();
    this.setRole('pending');
    const channel = await this.lobby.join(room);
    if (ticket !== this.entering) {
      channel?.leave();
      return;
    }
    if (!channel) {
      this.setRole('solo');
      return;
    }
    this.channel = channel;
    this.joinedAt = this.now();
    this.unsubscribe = channel.onPeers(() => this.evaluate());
  }

  /** 分頁切到背景：主機交出去（背景時畫面不更新，怪物會停住）。 */
  setAway(away: boolean): void {
    this.away = away;
    if (away) {
      // 背景時畫面不跑，不會再送 tick：現在就把主機與角色收掉
      this.hostSince = null;
      this.channel?.setPresence({ h: null, p: null, w: null });
      this.lastSent = '';
    }
    this.evaluate();
  }

  /** 自己放了技能：別人會重播半透明特效。 */
  castSkill(skillId: string, x: number, y: number, facing: 1 | -1): void {
    this.casts.push({ seq: ++this.castSeq, skillId, x: Math.round(x), y: Math.round(y), facing, at: this.now() });
  }

  /** 跟隨者自己打死了這隻：等主機確認。 */
  claimKill(uid: number): void {
    this.claims.push([uid, this.now()]);
  }

  /** 主機：這隻怪死了（自己或別人打死的），告訴跟隨者播死亡動畫。 */
  recordDeath(uid: number, peer: string | null): void {
    this.dead.push({ uid, peer: peer ?? this.selfPeer ?? '', at: this.now() });
  }

  /** 別的玩家（畫他們的角色） */
  remotePlayers(): RemotePlayer[] {
    const list: RemotePlayer[] = [];
    for (const peer of this.channel?.peers() ?? []) {
      if (peer.isMe) continue;
      const presence = readPresence(peer.presence);
      const state = readPlayer(presence?.p);
      if (state) list.push({ peer: peer.peer, by: peer.by, state, casts: readCasts(presence?.s) });
    }
    return list;
  }

  /** 每 ~100ms：選主機、送出自己的狀態（主機加上怪物世界）。 */
  tick(player: PlayerState | null, world: () => NetWorld): void {
    if (!this.channel) return;
    this.evaluate();
    const now = this.now();
    this.claims = this.claims.filter(([, at]) => now - at < CLAIM_TTL_MS);
    this.dead = this.dead.filter((d) => now - d.at < DEAD_TTL_MS);
    this.casts = this.casts.filter((c) => now - c.at < CAST_TTL_MS);
    const patch: Record<string, unknown> = {
      v: NET_VERSION,
      p: player && !this.away ? player : null,
      h: this.role === 'host' ? this.hostSince : null,
      k: this.claims.length ? this.claims : null,
      s: this.casts.length ? this.casts.map((c) => [c.seq, c.skillId, c.x, c.y, c.facing, c.at]) : null,
      w: this.role === 'host' ? encodeWorld({ ...world(), dead: this.dead.map((d) => [d.uid, d.peer] as [number, string]) }) : null,
    };
    const text = JSON.stringify(patch);
    if (text === this.lastSent) return;
    this.lastSent = text;
    this.channel.setPresence(patch);
  }

  dispose(): void {
    this.entering += 1;
    this.leaveChannel();
  }

  private leaveChannel(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.channel?.leave();
    this.channel = null;
    this.hostSince = null;
    this.claims = [];
    this.dead = [];
    this.handled.clear();
    this.lastWorld = null;
    this.lastSent = '';
  }

  private setRole(role: NetRole): void {
    if (role === this.role) return;
    this.role = role;
    this.handlers.onRole(role);
  }

  /** 選主機、轉交怪物世界、處理別人的擊殺宣告。 */
  private evaluate(): void {
    const channel = this.channel;
    if (!channel) return;
    const peers = channel.peers();
    const self = peers.find((p) => p.isMe)?.peer ?? null;
    const now = this.now();
    let host = currentHost(peers);
    // 自己剛宣告、平台還沒把自己的 presence 送回來：以自己為準
    if (this.hostSince !== null && self && (host === null || host === self)) host = self;
    if (host === null) {
      const waiting = now - this.joinedAt < HOST_GRACE_MS;
      const candidate = nextHost(peers.filter((p) => !(p.isMe && this.away)));
      if (!waiting && !this.away && self && (candidate === self || candidate === null)) {
        this.hostSince = now;
        host = self;
      } else {
        if (this.role === 'host') this.setRole('pending');
        return;
      }
    }
    if (host === self) {
      if (this.hostSince === null) this.hostSince = now;
      this.setRole('host');
      this.handleClaims(peers);
      return;
    }
    // 別人是主機：自己的宣告收回
    this.hostSince = null;
    this.setRole('follower');
    const hostPeer = peers.find((p) => p.peer === host);
    const raw = hostPeer ? readPresence(hostPeer.presence)?.w : undefined;
    if (raw && raw !== this.lastWorld) {
      this.lastWorld = raw;
      const world = decodeWorld(raw);
      if (world) this.handlers.onWorld(world);
    }
  }

  private handleClaims(peers: readonly NetPeer[]): void {
    const now = this.now();
    for (const [key, at] of this.handled) if (now - at > CLAIM_TTL_MS * 2) this.handled.delete(key);
    for (const peer of peers) {
      if (peer.isMe) continue;
      const claims = readPresence(peer.presence)?.k;
      if (!Array.isArray(claims)) continue;
      for (const claim of claims) {
        if (!Array.isArray(claim) || typeof claim[0] !== 'number') continue;
        const key = `${peer.peer}:${claim[0]}`;
        if (this.handled.has(key)) continue;
        this.handled.set(key, now);
        this.handlers.onRemoteKill(claim[0], peer.peer);
      }
    }
  }
}
