/**
 * 遊戲與伺服器之間的介面（SPEC §5.3、§5.4）。Demo 用 LocalServer；正式版換成真伺服器時遊戲端不用改。
 */

import type { InventoryAction, InventorySnapshot, LootItem } from '../inventory/model';
import type { NetMob } from '../net/protocol';

export interface MonsterSpawn {
  uid: number;
  typeId: string;
  zoneId: string;
  /** 確定性 AI 的亂數種子 */
  seed: number;
  spawnTime: number;
  /** 這隻怪的派彩倍率（生成時決定，頭上顯示） */
  multiplier: number;
  x: number;
  y: number;
}

export interface Snapshot {
  roomId: number;
  mapId: string;
  serverTime: number;
  balance: number;
  betRange: [number, number];
  monsters: MonsterSpawn[];
}

export interface JoinReq {
  roomId: number;
  classId: string;
}

export interface AttackReq {
  /** 每一刀遞增，用來防止重複扣款 */
  seq: number;
  skillId: string;
  /** 第幾刀（技能內的 strike 索引） */
  strike: number;
  bet: number;
  /** 命中的怪物；空陣列不會送出（揮空不扣款） */
  targets: number[];
  /** 開發模式：技能每一刀固定 1 倍（不套用技能押注倍數，SPEC §3.1） */
  flat?: boolean;
}

export type ErrorCode = 'INSUFFICIENT_BALANCE' | 'RATE_LIMIT' | 'BET_OUT_OF_RANGE' | 'ROOM_CHANGE_COOLDOWN' | 'UNKNOWN_SKILL';

export interface AttackResult {
  seq: number;
  cost: number;
  /** loot = 這隻怪掉出、已放進背包的武器與卷軸（畫面播放掉落與撿取） */
  results: { uid: number; killed: boolean; multiplier: number; payout: number; loot?: LootItem[] }[];
  balance: number;
  error?: ErrorCode;
}

export interface ChangeRoomReq {
  toRoomId: number;
  via: 'portal' | 'menu';
}

export interface ServerEvents {
  inventory: InventorySnapshot;
  monsterSpawn: MonsterSpawn;
  /** killed = 被打死（多人連線時是別的玩家打死的，播死亡動畫但沒有派彩）；否則直接消失 */
  monsterRemove: { uid: number; killed?: boolean };
  balance: { balance: number };
  feature: { type: 'bomb'; uid: number; x: number; y: number; results: AttackResult['results'] };
  wave: { phase: 'warning' | 'start' | 'end'; endsAt?: number };
}

export interface GameServer {
  inventorySnapshot(): InventorySnapshot;
  manageInventory(action: InventoryAction, allowDemo?: boolean): InventorySnapshot;
  join(req: JoinReq): Promise<Snapshot>;
  attack(req: AttackReq): Promise<AttackResult>;
  changeRoom(req: ChangeRoomReq): Promise<Snapshot>;
  /** 測試用：直接設定持有金幣（設定面板）。回傳實際設定的值。 */
  setBalance(balance: number): number;
  on<K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void): () => void;
  dispose(): void;

  // ---- 多人連線（SPEC §5.5）：怪物由一位玩家（主機）負責，錢包與擊殺判定各自算 ----
  /** true = 跟隨主機（不自己生怪）；false = 自己當主機（補滿生怪區） */
  setFollower(on: boolean): void;
  readonly isFollower: boolean;
  /** 跟隨者：怪物清單換成主機的（dead = 被打死的、ignore = 自己剛打死還沒確認的） */
  syncFromHost(mobs: readonly NetMob[], dead: ReadonlySet<number>, ignore: ReadonlySet<number>): void;
  /** 主機：別的玩家打死了這隻；還活著就移除並排重生，回傳 true */
  confirmRemoteKill(uid: number): boolean;
}
