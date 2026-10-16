/**
 * 多人連線協定（SPEC §5.5）：全部走每位玩家的「presence」（平台替每個人保存一份最新狀態，新進來的人也拿得到，
 * 每人上限 4 KiB）。不用事件，所以只有檢視權限的人也能一起玩。
 *
 * - 每個人：p = 自己的角色（位置、動作、裝備）；k = 最近 5 秒自己打死的怪（給主機確認）；s = 最近放的技能（別人重播半透明特效）
 * - 主機（負責生怪、怪物 AI）：h = 開始當主機的時間；w = 怪物世界（位置、倍率）與最近被打死的怪
 *
 * 主機：有人宣告就聽最早宣告的（同時宣告比 peer 字串小的）；沒人宣告時，標籤最小的人宣告。
 * 平台的訊息可能掉，所以都送「絕對狀態」，不送差異。
 */

export const NET_VERSION = 1;

/** 角色狀態（給其他人畫出你的角色）。 */
export interface PlayerState {
  x: number;
  y: number;
  /** 面向 */
  f: 1 | -1;
  /** 紙娃娃動作 Tag（stand、run、jump、swing1…） */
  a: string;
  /** 技能整體動畫 Tag；沒在播為 null */
  m: string | null;
  /** 技能動畫序號：同一招連放兩次也重播 */
  ms: number;
  /** 職業（決定武器） */
  c: string;
  /** 外觀武器（收藏武器的定義 id） */
  cw: string | null;
  /** 套服 id */
  o: string | null;
}

/** 世界裡的一隻怪（主機送出）。 */
export interface NetMob {
  uid: number;
  type: string;
  zone: string;
  x: number;
  y: number;
  facing: 1 | -1;
  /** 0 = 站著、1 = 移動、2 = 受擊 */
  state: 0 | 1 | 2;
  multiplier: number;
}

export interface NetWorld {
  mobs: NetMob[];
  /** 最近被打死的怪：[uid, 打死它的 peer] */
  dead: [number, string][];
}

/** presence 裡的世界：類型與生怪區用索引表，省空間（4 KiB 上限）。 */
interface EncodedWorld {
  t: string[];
  z: string[];
  /** [uid, 類型索引, x, y, 面向與狀態, 倍率, 生怪區索引] */
  m: number[][];
  d: [number, string][];
}

export interface NetPresence {
  v: typeof NET_VERSION;
  p?: PlayerState;
  /** 開始當主機的時間（Date.now()）；不是主機就沒有 */
  h?: number;
  w?: EncodedWorld;
  /** 自己打死、還等主機確認的怪：[uid, Date.now()] */
  k?: [number, number][];
  /** 最近 2 秒放的技能：[序號, 技能 id, x, y, 面向, Date.now()] */
  s?: [number, string, number, number, number, number][];
}

/** 一次放技能（別人照這個重播特效）。 */
export interface NetCast {
  seq: number;
  skillId: string;
  x: number;
  y: number;
  facing: 1 | -1;
  /** 放的時間（Date.now()，放的人的時鐘） */
  at: number;
}

export function readCasts(raw: unknown): NetCast[] {
  if (!Array.isArray(raw)) return [];
  const casts: NetCast[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'string' || typeof row[2] !== 'number' || typeof row[3] !== 'number') continue;
    casts.push({ seq: row[0], skillId: row[1], x: row[2], y: row[3], facing: row[4] === 1 ? 1 : -1, at: typeof row[5] === 'number' ? row[5] : 0 });
  }
  return casts;
}

export interface NetPeer {
  peer: string;
  isMe: boolean;
  /** 平台給的使用者 id（宣告 user 能力時才有），查名字用 */
  by: string | null;
  presence: Record<string, unknown>;
}

/** presence 太大時最多送幾隻怪（4 KiB 內，每隻約 30 bytes） */
export const MAX_NET_MOBS = 90;

export function encodeWorld(world: NetWorld): EncodedWorld {
  const types: string[] = [];
  const zones: string[] = [];
  const index = (list: string[], value: string) => {
    let i = list.indexOf(value);
    if (i < 0) i = list.push(value) - 1;
    return i;
  };
  const m = world.mobs.slice(0, MAX_NET_MOBS).map((mob) => [
    mob.uid,
    index(types, mob.type),
    Math.round(mob.x),
    Math.round(mob.y),
    (mob.facing === 1 ? 1 : 0) + mob.state * 2,
    mob.multiplier,
    index(zones, mob.zone),
  ]);
  return { t: types, z: zones, m, d: world.dead };
}

export function decodeWorld(raw: unknown): NetWorld | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Partial<EncodedWorld>;
  if (!Array.isArray(w.t) || !Array.isArray(w.z) || !Array.isArray(w.m)) return null;
  const mobs: NetMob[] = [];
  for (const row of w.m) {
    if (!Array.isArray(row) || row.length < 7 || !row.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const [uid, t, x, y, fs, multiplier, z] = row as number[];
    const type = w.t[t!];
    const zone = w.z[z!];
    if (typeof type !== 'string' || typeof zone !== 'string') continue;
    const state = Math.floor(fs! / 2);
    mobs.push({ uid: uid!, type, zone, x: x!, y: y!, facing: fs! % 2 === 1 ? 1 : -1, state: state === 1 || state === 2 ? state : 0, multiplier: multiplier! });
  }
  const dead = Array.isArray(w.d) ? w.d.filter((d): d is [number, string] => Array.isArray(d) && typeof d[0] === 'number' && typeof d[1] === 'string') : [];
  return { mobs, dead };
}

export function readPresence(raw: Record<string, unknown>): NetPresence | null {
  return raw.v === NET_VERSION ? (raw as unknown as NetPresence) : null;
}

export function readPlayer(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PlayerState>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || typeof p.a !== 'string' || typeof p.c !== 'string') return null;
  return {
    x: p.x,
    y: p.y,
    f: p.f === 1 ? 1 : -1,
    a: p.a,
    m: typeof p.m === 'string' ? p.m : null,
    ms: typeof p.ms === 'number' ? p.ms : 0,
    c: p.c,
    cw: typeof p.cw === 'string' ? p.cw : null,
    o: typeof p.o === 'string' ? p.o : null,
  };
}

/** 誰是主機：宣告最早的（時間相同比 peer）；沒人宣告回傳 null。 */
export function currentHost(peers: readonly NetPeer[]): string | null {
  let best: { peer: string; since: number } | null = null;
  for (const peer of peers) {
    const since = readPresence(peer.presence)?.h;
    if (typeof since !== 'number') continue;
    if (!best || since < best.since || (since === best.since && peer.peer < best.peer)) best = { peer: peer.peer, since };
  }
  return best?.peer ?? null;
}

/** 沒有主機時誰該出來當：標籤最小、已經進入遊戲（有角色狀態）的人。 */
export function nextHost(peers: readonly NetPeer[]): string | null {
  const ready = peers.filter((p) => readPresence(p.presence)?.p).map((p) => p.peer).sort();
  return ready[0] ?? null;
}
