import {
  DEFAULT_RTP,
  FootholdWorld,
  resolveStrike,
  strikeCostMultiplier,
  rollMultiplier,
  seededRandom,
  type MapDef,
  type RoomDef,
  type SpawnZone,
} from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { inventoryAction, newProfile, parseProfile, rollLootDrops, type InventoryAction, type InventoryFeedback, type InventoryProfile, type InventorySnapshot, type LootItem } from '../inventory/model';
import type { NetMob } from '../net/protocol';
import type { AttackReq, AttackResult, ChangeRoomReq, GameServer, JoinReq, MonsterSpawn, ServerEvents, Snapshot } from './types';

/**
 * 在瀏覽器裡模擬伺服器：虛擬幣錢包（localStorage）、生怪與補怪、擊殺判定、攻速限制、換房結算。
 * 瀏覽器內的判定可以被竄改，只適合 Demo（SPEC §5.3）。
 */
export interface LocalServerOptions {
  rtp?: number;
  /** 模擬網路延遲（毫秒區間） */
  latencyMs?: [number, number];
  startingBalance?: number;
  /** 測試用：每個生怪區的數量上限倍率 */
  spawnScale?: number;
  storageKey?: string;
}

const MAX_STRIKES_PER_SECOND = 24;


function secureRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 4294967296;
}

interface LiveMonster {
  spawn: MonsterSpawn;
  zone: SpawnZone;
}

export class LocalServer implements GameServer {
  private profile: InventoryProfile;
  private inventoryFeedback: InventoryFeedback | undefined;
  private inventoryRevision = 0;
  private storageError = false;
  private balance: number;
  private room: RoomDef | null = null;
  private map: MapDef | null = null;
  private world: FootholdWorld | null = null;
  private readonly monsters = new Map<number, LiveMonster>();
  private readonly respawnQueue: { zoneId: string; at: number }[] = [];
  private readonly handlers = new Map<keyof ServerEvents, Set<(data: never) => void>>();
  private nextUid = 1;
  private lastSeq = -1;
  private strikeTimes: number[] = [];
  private lastRoomChange = 0;
  /** 多人連線：跟隨主機（不自己生怪，怪物清單由主機同步）；錢包與擊殺判定仍在自己這裡 */
  private follower = false;
  private timer: ReturnType<typeof setInterval>;
  private readonly rtp: number;
  private readonly latency: [number, number];
  private readonly spawnScale: number;
  private readonly storageKey: string;

  constructor(
    private readonly bundle: ContentBundle,
    options: LocalServerOptions = {},
  ) {
    this.rtp = options.rtp ?? DEFAULT_RTP;
    this.latency = options.latencyMs ?? [30, 100];
    this.spawnScale = options.spawnScale ?? 1;
    this.storageKey = options.storageKey ?? 'lawn.balance';
    this.balance = this.loadBalance(options.startingBalance ?? 100_000);
    this.profile = this.loadProfile() ?? newProfile(this.balance);
    this.balance = this.profile.balance;
    this.saveBalance();
    this.timer = setInterval(() => this.tick(), 250);
  }

  on<K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (data: never) => void);
    return () => set.delete(handler as (data: never) => void);
  }

  private emit<K extends keyof ServerEvents>(event: K, data: ServerEvents[K]): void {
    for (const handler of this.handlers.get(event) ?? []) (handler as (d: ServerEvents[K]) => void)(data);
  }

  async join(req: JoinReq): Promise<Snapshot> {
    await this.delay();
    return this.enterRoom(req.roomId);
  }

  async changeRoom(req: ChangeRoomReq): Promise<Snapshot> {
    await this.delay();
    if (performance.now() - this.lastRoomChange < 2000) throw new Error('ROOM_CHANGE_COOLDOWN');
    return this.enterRoom(req.toRoomId);
  }

  async attack(req: AttackReq): Promise<AttackResult> {
    await this.delay();
    const fail = (error: AttackResult['error']): AttackResult => ({ seq: req.seq, cost: 0, results: [], balance: this.balance, error });
    if (req.seq <= this.lastSeq) return fail('RATE_LIMIT');
    this.lastSeq = req.seq;
    const skill = this.bundle.skills.get(req.skillId);
    const strike = skill?.strikes[req.strike];
    if (!skill || !strike) return fail('UNKNOWN_SKILL');
    if (!this.room || req.bet < this.room.betRange[0] || req.bet > this.room.betRange[1]) return fail('BET_OUT_OF_RANGE');
    const now = performance.now();
    this.strikeTimes = this.strikeTimes.filter((t) => now - t < 1000);
    if (this.strikeTimes.length >= MAX_STRIKES_PER_SECOND) return fail('RATE_LIMIT');
    this.strikeTimes.push(now);

    // 已經死掉的目標不算；全部都不在時退款（不扣）
    const targets = req.targets
      .slice(0, strike.maxTargets)
      .map((uid) => this.monsters.get(uid))
      .filter((m): m is LiveMonster => m !== undefined);
    if (targets.length === 0) return { seq: req.seq, cost: 0, results: [], balance: this.balance };

    // 技能押注倍數（SPEC §3.1）：這一刀扣 押注 × c，擊殺機率也乘上 c
    const strikeTargets = targets.map((m) => ({ uid: m.spawn.uid, multiplier: m.spawn.multiplier }));
    const costMul = strikeCostMultiplier(skill, req.strike, strikeTargets, this.rtp, { flat: req.flat ?? false });
    const cost = Math.round(req.bet * costMul * 100) / 100;
    if (this.balance < cost) return fail('INSUFFICIENT_BALANCE');
    this.balance -= cost;
    const outcomes = resolveStrike(strikeTargets, req.bet, this.rtp, strike.weightRule, secureRandom, costMul);
    const loot: string[] = [];
    const lootByUid = new Map<number, LootItem[]>();
    for (const outcome of outcomes) {
      if (!outcome.killed) continue;
      this.balance += outcome.payout;
      const dead = this.monsters.get(outcome.uid);
      if (dead) this.removeMonster(dead, false);
      const drop = rollLootDrops(this.profile.inventory, secureRandom);
      loot.push(...drop.messages);
      if (drop.items.length > 0) lootByUid.set(outcome.uid, drop.items);
    }
    this.saveBalance();
    if (loot.length) {
      this.inventoryFeedback = { id: ++this.inventoryRevision, kind: 'drop', message: `拾取：${loot.join('、')}` };
      this.emit('inventory', this.inventorySnapshot());
    }
    return {
      seq: req.seq,
      cost,
      results: outcomes.map(({ uid, killed, multiplier, payout }) => ({ uid, killed, multiplier, payout, ...(lootByUid.has(uid) ? { loot: lootByUid.get(uid) } : {}) })),
      balance: this.balance,
    };
  }

  dispose(): void {
    clearInterval(this.timer);
    this.handlers.clear();
  }

  inventorySnapshot(): InventorySnapshot {
    return { inventory: structuredClone(this.profile.inventory), ...(this.inventoryFeedback ? { feedback: { ...this.inventoryFeedback } } : {}), storageError: this.storageError };
  }

  manageInventory(action: InventoryAction, allowDemo = false): InventorySnapshot {
    this.profile.balance = this.balance;
    this.inventoryFeedback = { ...inventoryAction(this.profile, action, secureRandom, allowDemo), id: ++this.inventoryRevision };
    this.balance = this.profile.balance;
    this.saveBalance();
    this.emit('balance', { balance: this.balance });
    const snapshot = this.inventorySnapshot();
    this.emit('inventory', snapshot);
    return snapshot;
  }

  setBalance(balance: number): number {
    this.balance = Number.isFinite(balance) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(balance))) : this.balance;
    this.saveBalance();
    this.emit('balance', { balance: this.balance });
    return this.balance;
  }

  // -------------------------------------------------------------------------

  private async enterRoom(roomId: number): Promise<Snapshot> {
    const room = this.bundle.rooms.find((r) => r.id === roomId) ?? this.bundle.rooms[0];
    if (!room) throw new Error('沒有任何房間設定');
    this.room = room;
    this.map = await this.bundle.loadMap(room.mapId);
    this.world = new FootholdWorld(this.map);
    this.monsters.clear();
    this.respawnQueue.length = 0;
    this.lastRoomChange = performance.now();
    if (!this.follower) this.fillZones(false);
    return {
      roomId: room.id,
      mapId: room.mapId,
      serverTime: performance.now(),
      balance: this.balance,
      betRange: room.betRange,
      monsters: [...this.monsters.values()].map((m) => m.spawn),
    };
  }

  private spawnIn(zone: SpawnZone, notify: boolean): void {
    if (!this.world) return;
    const random = Math.random;
    // Boss 只能定時出現（SPEC §3.8），就算內容把 Boss 放進一般生怪區也略過
    const pool = zone.pool.filter((e) => this.bundle.monsters.get(e.mobId)?.math?.tier !== 'boss');
    if (pool.length === 0) return;
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = random() * totalWeight;
    const entry = pool.find((e) => (pick -= e.weight) < 0) ?? pool[0]!;
    const monster = this.bundle.monsters.get(entry.mobId);
    if (!monster) return;
    const multiplier = rollMultiplier(monster.math?.multiplier ?? 2, random);

    let x = zone.rect.x + random() * zone.rect.w;
    let y = zone.rect.y + random() * zone.rect.h;
    if (monster.def.behavior.move !== 'fly') {
      const ground = this.world.groundBelow(x, zone.rect.y - 4);
      if (!ground || ground.y > zone.rect.y + zone.rect.h + 32) return;
      y = ground.y;
    } else {
      x = Math.round(x);
      y = Math.round(y);
    }
    const spawn: MonsterSpawn = {
      uid: this.nextUid++,
      typeId: entry.mobId,
      zoneId: zone.id,
      seed: Math.floor(random() * 2 ** 31),
      spawnTime: performance.now(),
      multiplier,
      x,
      y,
    };
    this.monsters.set(spawn.uid, { spawn, zone });
    if (notify) this.emit('monsterSpawn', spawn);
  }

  private removeMonster(monster: LiveMonster, notify: boolean, killed = false): void {
    this.monsters.delete(monster.spawn.uid);
    if (!this.follower) this.respawnQueue.push({ zoneId: monster.zone.id, at: performance.now() + monster.zone.respawnSec * 1000 });
    if (notify) this.emit('monsterRemove', { uid: monster.spawn.uid, ...(killed ? { killed } : {}) });
  }

  /** 每個生怪區補到上限：房間是空的就立刻生，否則排進重生（別人剛離開、自己接手當主機時不會一次冒一堆）。 */
  private fillZones(notify: boolean): void {
    if (!this.map) return;
    const empty = this.monsters.size === 0;
    const now = performance.now();
    for (const zone of this.map.spawnZones) {
      const alive = [...this.monsters.values()].filter((m) => m.zone.id === zone.id).length;
      const queued = this.respawnQueue.filter((r) => r.zoneId === zone.id).length;
      const missing = Math.round(zone.maxCount * this.spawnScale) - alive - queued;
      for (let i = 0; i < missing; i += 1) {
        if (empty) this.spawnIn(zone, notify);
        else this.respawnQueue.push({ zoneId: zone.id, at: now + Math.random() * zone.respawnSec * 1000 });
      }
    }
  }

  // ---------------------------------------------------------------- 多人連線（SPEC §5.5）

  /** 切換成跟隨主機（true）或自己當主機（false，接手時補滿生怪區）。 */
  setFollower(on: boolean): void {
    if (this.follower === on) return;
    this.follower = on;
    if (on) this.respawnQueue.length = 0;
    else this.fillZones(true);
  }

  get isFollower(): boolean {
    return this.follower;
  }

  /** 主機用：目前這一房的怪（位置由畫面那邊的怪物 AI 決定）。 */
  liveMonsters(): MonsterSpawn[] {
    return [...this.monsters.values()].map((m) => m.spawn);
  }

  /**
   * 跟隨者：把怪物清單換成主機送來的。新的送 monsterSpawn、不見的送 monsterRemove（dead 裡的是被打死）；
   * ignore = 自己剛打死、主機還沒確認的（不要復活）。
   */
  syncFromHost(mobs: readonly NetMob[], dead: ReadonlySet<number>, ignore: ReadonlySet<number>): void {
    if (!this.follower || !this.map) return;
    const seen = new Set<number>();
    for (const mob of mobs) {
      this.nextUid = Math.max(this.nextUid, mob.uid + 1);
      if (ignore.has(mob.uid)) continue;
      seen.add(mob.uid);
      const existing = this.monsters.get(mob.uid);
      if (existing && existing.spawn.typeId === mob.type) continue;
      if (existing) this.removeMonster(existing, true);
      const zone = this.map.spawnZones.find((z) => z.id === mob.zone) ?? this.map.spawnZones[0];
      if (!zone || !this.bundle.monsters.has(mob.type)) continue;
      const spawn: MonsterSpawn = { uid: mob.uid, typeId: mob.type, zoneId: zone.id, seed: mob.uid, spawnTime: performance.now(), multiplier: mob.multiplier, x: mob.x, y: mob.y };
      this.monsters.set(spawn.uid, { spawn, zone });
      this.emit('monsterSpawn', spawn);
    }
    for (const monster of [...this.monsters.values()]) {
      if (!seen.has(monster.spawn.uid)) this.removeMonster(monster, true, dead.has(monster.spawn.uid));
    }
  }

  /** 主機：別的玩家打死了這隻（他自己已經派彩）。還活著就移除並排重生，回傳 true。 */
  confirmRemoteKill(uid: number): boolean {
    const monster = this.monsters.get(uid);
    if (!monster || this.follower) return false;
    this.removeMonster(monster, true, true);
    return true;
  }

  private tick(): void {
    if (!this.map || this.follower) return;
    const now = performance.now();
    for (let i = this.respawnQueue.length - 1; i >= 0; i -= 1) {
      const entry = this.respawnQueue[i]!;
      if (entry.at > now) continue;
      this.respawnQueue.splice(i, 1);
      const zone = this.map.spawnZones.find((z) => z.id === entry.zoneId);
      if (zone) this.spawnIn(zone, true);
    }
  }

  private delay(): Promise<void> {
    const [min, max] = this.latency;
    return new Promise((resolve) => setTimeout(resolve, min + seededRandom(Date.now())() * (max - min)));
  }

  private loadBalance(fallback: number): number {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const stored = Number(raw);
      return raw !== null && Number.isSafeInteger(stored) && stored >= 0 ? stored : fallback;
    } catch {
      return fallback;
    }
  }

  private saveBalance(): void {
    try {
      this.profile.balance = this.balance;
      localStorage.setItem(`${this.storageKey}.profile.v1`, JSON.stringify(this.profile));
      this.storageError = false;
    } catch {
      this.storageError = true;
    }
  }

  private loadProfile(): InventoryProfile | null {
    try { return parseProfile(localStorage.getItem(`${this.storageKey}.profile.v1`)); }
    catch { return null; }
  }
}
