import * as Phaser from 'phaser';
import {
  FootholdWorld,
  PHYSICS,
  buildNavGraph,
  type Area,
  type AvatarLoadout,
  type ClassId,
  type MapDef,
  type NavGraph,
  type Rect,
  type SkillDef,
} from '@lawn/shared';
import { Player, type PlayerInput } from '../actor/Player';
import { AutoHunt, DEFAULT_AUTO_CONFIG, type AutoConfig } from '../auto/AutoHunt';
import { AvatarView } from '../avatar/AvatarView';
import type { ContentBundle } from '../content/bundle';
import { InputState } from '../core/input';
import { FxLayer, TIER_TINT } from '../feel/FxLayer';
import type { GameCommand, HudState } from '../hud';
import { DEPTH, MapView } from '../map/MapView';
import { MonsterActor } from '../monster/MonsterActor';
import { loadSheetAssets } from '../render/sheets';
import { LocalServer } from '../server/LocalServer';
import type { AttackResult, GameServer, MonsterSpawn, Snapshot } from '../server/types';

export const INTERNAL_HEIGHT = 540;
const STEP_MS = PHYSICS.dt * 1000;
const BIG_WIN = { big: 50, mega: 100, super: 300 } as const;
/** 手動介入後多久恢復掛機（SPEC §3.6） */
const AUTO_RESUME_MS = 3000;
const AUTO_CONFIG_KEY = 'lawn.autoConfig';

export interface GameSceneOptions {
  bundle: ContentBundle;
  roomId?: number;
  mapOverride?: MapDef;
  classId?: ClassId;
  lighting?: boolean;
  spawnScale?: number;
  showColliders?: boolean;
  onHud?: (state: HudState) => void;
  onExit?: () => void;
  onReady?: () => void;
}

interface Projectile {
  sprite: Phaser.GameObjects.Sprite;
  /** 上一步的位置：判定用「掃過的區段」，貼身的怪也打得到、高速也不會穿過去 */
  lastX: number;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  remaining: number;
  skill: SkillDef;
  strike: number;
}

export class GameScene extends Phaser.Scene {
  private opts!: GameSceneOptions;
  private bundle!: ContentBundle;
  private server!: GameServer;
  private keys!: InputState;
  private world!: FootholdWorld;
  private mapView: MapView | null = null;
  private avatar!: AvatarView;
  private player!: Player;
  private fx!: FxLayer;
  private readonly monsters = new Map<number, MonsterActor>();
  private projectiles: Projectile[] = [];
  private accumulator = 0;
  private hitStopMs = 0;
  private slowMoMs = 0;
  private ready = false;
  private switching = false;
  private seq = 0;
  private serverBalance = 0;
  private pendingCost = 0;
  private betIndex = 0;
  private roomId = 1;
  private roomName = '';
  private betRange: [number, number] = [1, 50];
  private classId: ClassId = 'warrior';
  private hudElapsed = 0;
  private toast: HudState['toast'];
  private bigWin: HudState['bigWin'];
  private uiId = 0;
  private prevPlayer = { x: 0, y: 0 };
  private cameraTarget!: Phaser.GameObjects.Zone;
  private colliders = false;
  private unsubscribes: (() => void)[] = [];
  private readonly damageStacks = new Map<number, { count: number; at: number }>();
  private playerLight: Phaser.GameObjects.Light | null = null;
  /** HUD 底欄佔用的高度（裝置像素），遊戲畫面畫在它上方 */
  private insetBottom = 0;
  /** 場景已銷毀：非同步載入回來後一律忽略 */
  private dead = false;
  private nav: NavGraph = { nodes: [], edges: [] };
  private readonly auto = new AutoHunt();
  private autoOn = false;
  /** 手動介入：這個時間（performance.now）之前不掛機 */
  private autoPausedUntil = 0;
  private autoSession = { startBalance: 0, startedAt: 0 };

  constructor() {
    super('game');
  }

  init(options: GameSceneOptions): void {
    this.opts = options;
    this.bundle = options.bundle;
    this.classId = options.classId ?? 'warrior';
    this.colliders = options.showColliders ?? false;
    this.auto.config = loadAutoConfig();
  }

  create(): void {
    this.keys = new InputState(window);
    this.keys.onManualInput = () => this.pauseAutoForManual();
    this.fx = new FxLayer(this, this.bundle);
    this.cameraTarget = this.add.zone(0, 0, 1, 1);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());
    this.boot().catch((error: unknown) => {
      console.error(error);
      this.emitHud({ error: error instanceof Error ? error.message : String(error) });
    });
  }

  private async boot(): Promise<void> {
    const { bundle } = this;
    await loadSheetAssets(this, bundle.source, [
      bundle.base,
      ...[...bundle.items.values()].map((entry) => entry.sheet),
      ...[...bundle.monsters.values()].map((entry) => entry.sheet),
      ...bundle.fx.values(),
    ]);
    if (this.dead) return;
    this.server = new LocalServer(bundle, { spawnScale: this.opts.spawnScale ?? 1 });
    this.unsubscribes.push(
      this.server.on('monsterSpawn', (spawn) => this.spawnMonster(spawn)),
      this.server.on('monsterRemove', ({ uid }) => this.monsters.get(uid)?.destroy()),
    );

    this.avatar = new AvatarView(this, bundle);
    this.avatar.setDepth(DEPTH.player);
    const classDef = bundle.classes.get(this.classId)!;
    this.player = new Player(
      new FootholdWorld({ footholds: [], walls: [], ceilings: [], climbables: [], size: { w: 1, h: 1 } }),
      0,
      0,
      classDef,
      bundle.skills,
      (tag) => this.poseDuration(tag),
      this.avatar,
      {
        onStrike: (skill, index) => this.onStrike(skill, index),
        onSkillStart: (skill) => this.onSkillStart(skill),
        onRoll: () => this.onRoll(),
        onLand: (impact) => this.onLand(impact),
      },
    );
    this.applyLoadout();

    const snapshot = await this.server.join({ roomId: this.opts.roomId ?? 1, classId: this.classId });
    if (this.dead) return;
    await this.enterRoom(snapshot, 'spawn');
    if (this.dead) return;
    this.ready = true;
    this.opts.onReady?.();
    this.emitHud({ loading: false });
  }

  // ---------------------------------------------------------------------------
  // 房間
  // ---------------------------------------------------------------------------

  private async enterRoom(snapshot: Snapshot, arriveAt: 'spawn' | 'next' | 'prev'): Promise<void> {
    const map = this.opts.mapOverride ?? (await this.bundle.loadMap(snapshot.mapId));
    const theme = this.bundle.themes.get(map.theme);
    await MapView.preload(this, this.bundle.source, map, theme);
    if (this.dead) return;

    this.mapView?.destroy();
    for (const monster of this.monsters.values()) monster.destroy();
    this.monsters.clear();
    for (const p of this.projectiles) p.sprite.destroy();
    this.projectiles = [];
    this.fx.destroy();

    this.world = new FootholdWorld(map);
    // 編輯器預覽的地圖可能還沒產生導航圖：現場算一份
    this.nav = map.nav.edges.length > 0 ? map.nav : buildNavGraph(map);
    this.auto.reset();
    this.mapView = new MapView(this, map, theme);
    this.mapView.build({ lighting: this.opts.lighting ?? true });
    this.mapView.setDebug(this.colliders);
    this.avatar.setLit(this.opts.lighting ?? true);
    // 玩家身上一盞柔光，亮度隨押注等級提高（SPEC §4.2）
    if (this.playerLight) this.lights.removeLight(this.playerLight);
    this.playerLight = this.opts.lighting === false ? null : this.lights.addLight(0, 0, 130, 0xfff2d6, 0.8);

    const room = this.bundle.rooms.find((r) => r.id === snapshot.roomId);
    this.roomId = snapshot.roomId;
    this.roomName = room?.name ?? map.name;
    this.betRange = snapshot.betRange;
    this.serverBalance = snapshot.balance;
    this.clampBet();

    // 依進房方式決定出生位置：走「下一房」傳送點進來的，出現在新房的「上一房」傳送點，反之亦然。
    const portalType = arriveAt === 'next' ? 'prev' : arriveAt === 'prev' ? 'next' : 'spawn';
    const portal = map.portals.find((p) => p.type === portalType) ?? map.portals.find((p) => p.type === 'spawn') ?? { x: map.size.w / 2, y: 0 };
    const body = this.player.body;
    const ground = this.world.groundBelow(portal.x, portal.y - 24);
    Object.assign(body, { x: portal.x, y: ground?.y ?? portal.y, vx: 0, vy: 0, ground: ground?.fh ?? null, climb: null });
    this.prevPlayer = { x: body.x, y: body.y };
    this.player.climbTypeOf = (id) => this.world.climbables.find((c) => c.id === id)?.type ?? 'ladder';

    for (const spawn of snapshot.monsters) this.spawnMonster(spawn);

    const camera = this.cameras.main;
    const bounds = map.cameraBounds;
    camera.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    this.cameraTarget.setPosition(body.x, body.y - 30);
    camera.startFollow(this.cameraTarget, false, 0.12, 0.12);
    camera.setDeadzone(48, 36);
    this.applyZoom();
    camera.centerOn(body.x, body.y - 30);
    camera.fadeIn(250, 0, 0, 0);
  }

  private async changeRoom(roomId: number, via: 'portal' | 'menu', arriveAt: 'spawn' | 'next' | 'prev'): Promise<void> {
    if (this.switching || roomId === this.roomId) return;
    this.switching = true;
    try {
      const camera = this.cameras.main;
      camera.fadeOut(200, 0, 0, 0);
      const [snapshot] = await Promise.all([this.server.changeRoom({ toRoomId: roomId, via }), new Promise((r) => setTimeout(r, 220))]);
      await this.enterRoom(snapshot, arriveAt);
    } catch (error) {
      this.showToast(error instanceof Error && error.message === 'ROOM_CHANGE_COOLDOWN' ? '換房冷卻中' : '換房失敗');
      this.cameras.main.fadeIn(150, 0, 0, 0);
    } finally {
      this.switching = false;
    }
  }

  /**
   * 遊戲畫面只畫在 HUD 底欄上方（像楓之谷的狀態列在畫面外），
   * 縮放讓內部 540 像素高剛好填滿這塊區域。
   */
  private applyZoom(): void {
    const height = Math.max(120, this.scale.height - this.insetBottom);
    const camera = this.cameras.main;
    camera.setViewport(0, 0, this.scale.width, height);
    camera.setZoom(height / INTERNAL_HEIGHT);
  }

  /** HUD 佔用的底部高度（裝置像素）。 */
  setViewInsets(bottom: number): void {
    const next = Math.max(0, Math.round(bottom));
    if (next === this.insetBottom) return;
    this.insetBottom = next;
    if (this.cameras?.main) this.applyZoom();
  }

  private spawnMonster(spawn: MonsterSpawn): void {
    const entry = this.bundle.monsters.get(spawn.typeId);
    const map = this.mapView?.map;
    if (!entry || !map || this.monsters.has(spawn.uid)) return;
    const zone = map.spawnZones.find((z) => z.id === spawn.zoneId)?.rect ?? { x: 0, y: 0, w: map.size.w, h: map.size.h };
    const actor = new MonsterActor(this, this.world, entry.def, entry.math, entry.sheet, spawn, zone, this.opts.lighting ?? true);
    this.monsters.set(spawn.uid, actor);
  }

  // ---------------------------------------------------------------------------
  // 主迴圈
  // ---------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    if (!this.ready || this.switching) return;
    const frameMs = Math.min(delta, 100);
    this.handleCommandsFromKeys();

    let animDt = frameMs;
    if (this.hitStopMs > 0) {
      this.hitStopMs -= frameMs;
      animDt = 0;
    } else {
      const scaled = this.slowMoMs > 0 ? frameMs * 0.35 : frameMs;
      this.slowMoMs = Math.max(0, this.slowMoMs - frameMs);
      animDt = scaled;
      this.accumulator += scaled;
      while (this.accumulator >= STEP_MS) {
        this.prevPlayer = { x: this.player.body.x, y: this.player.body.y };
        this.fixedStep();
        this.accumulator -= STEP_MS;
      }
    }

    // 畫面：玩家位置在兩個物理步之間插值，最後取整到像素格。
    const alpha = this.accumulator / STEP_MS;
    const body = this.player.body;
    const px = this.prevPlayer.x + (body.x - this.prevPlayer.x) * alpha;
    const py = this.prevPlayer.y + (body.y - this.prevPlayer.y) * alpha;
    this.player.animate();
    this.avatar.tick(animDt);
    this.avatar.setPosition(Math.round(px), Math.round(py));
    this.cameraTarget.setPosition(px, py - 30);
    if (this.playerLight) {
      this.playerLight.setPosition(px, py - 28);
      this.playerLight.intensity = 0.6 + this.betTier * 0.18;
      this.playerLight.radius = 110 + this.betTier * 14;
    }

    for (const [uid, monster] of this.monsters) {
      monster.tick(animDt);
      if (monster.state === 'gone') {
        monster.destroy();
        this.monsters.delete(uid);
      }
    }
    for (const p of this.projectiles) p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    this.fx.update(animDt === 0 ? 0 : frameMs, this.hitStopMs > 0);
    this.mapView?.update(frameMs, this.cameras.main);

    this.hudElapsed += frameMs;
    if (this.hudElapsed >= 100) {
      this.hudElapsed = 0;
      this.checkAutoStop();
      this.emitHud({});
    }
  }

  private fixedStep(): void {
    const k = this.keys;
    const manual: PlayerInput = {
      x: k.axisX(),
      up: k.isHeld('up'),
      down: k.isHeld('down'),
      jumpPressed: k.consume('jump'),
      jumpHeld: k.isHeld('jump'),
      attack: k.consume('attack') || k.isHeld('attack'),
      skill1: k.consume('skill1'),
      skill2: k.consume('skill2'),
      roll: k.consume('roll'),
    };
    // 按住任何移動或攻擊鍵：掛機持續暫停，放開 3 秒後恢復
    if (manual.x !== 0 || manual.up || manual.down || manual.jumpHeld || manual.attack) this.pauseAutoForManual();
    const driving = this.autoDriving;
    const input = driving ? this.stepAuto() : manual;
    this.player.step(this.world, input);
    for (const monster of this.monsters.values()) monster.step();
    this.stepProjectiles();
    // 掛機只有在「前往傳送點」時才會用 ↑ 換房，爬繩時按 ↑ 不會誤觸旁邊的傳送點
    this.checkPortals(driving ? input.up && this.auto.status === 'portal' : manual.up);
  }

  private get autoDriving(): boolean {
    return this.autoOn && performance.now() >= this.autoPausedUntil;
  }

  private stepAuto(): PlayerInput {
    const classDef = this.bundle.classes.get(this.classId)!;
    return this.auto.step({
      world: this.world,
      nav: this.nav,
      map: this.mapView!.map,
      player: this.player,
      monsters: this.monsters.values(),
      basic: this.bundle.skills.get(classDef.basic)!,
      skills: classDef.skills.map((id) => this.bundle.skills.get(id)),
    });
  }

  private pauseAutoForManual(): void {
    if (this.autoOn) this.autoPausedUntil = performance.now() + AUTO_RESUME_MS;
  }

  private setAuto(on: boolean, reason?: string): void {
    if (on === this.autoOn) return;
    this.autoOn = on;
    this.autoPausedUntil = 0;
    this.auto.reset();
    if (on) {
      this.autoSession = { startBalance: this.displayBalance, startedAt: performance.now() };
      this.showToast('自動冒險開始');
    } else {
      this.showToast(reason ? `自動冒險停止：${reason}` : '自動冒險停止');
    }
  }

  /** 停止條件（SPEC §3.6）；單次派彩倍數在 onPayout 檢查。 */
  private checkAutoStop(): void {
    if (!this.autoOn) return;
    const stop = this.auto.config.stop;
    const balance = this.displayBalance;
    const net = balance - this.autoSession.startBalance;
    if (balance < this.bet) this.setAuto(false, '餘額不足');
    else if (stop.balanceBelow !== null && balance < stop.balanceBelow) this.setAuto(false, `餘額低於 ${stop.balanceBelow.toLocaleString()}`);
    else if (stop.lossAtLeast !== null && -net >= stop.lossAtLeast) this.setAuto(false, `累計輸 ${(-net).toLocaleString()}`);
    else if (stop.winAtLeast !== null && net >= stop.winAtLeast) this.setAuto(false, `累計贏 ${net.toLocaleString()}`);
    else if (stop.minutes !== null && performance.now() - this.autoSession.startedAt >= stop.minutes * 60_000) this.setAuto(false, '時間到');
  }

  private handleCommandsFromKeys(): void {
    const k = this.keys;
    if (k.consume('betUp')) this.command({ type: 'stepBet', delta: 1 });
    if (k.consume('betDown')) this.command({ type: 'stepBet', delta: -1 });
    if (k.consume('debug')) this.command({ type: 'toggleDebug' });
    const classKeys = ['class1', 'class2', 'class3', 'class4'] as const;
    const classIds: ClassId[] = ['warrior', 'mage', 'archer', 'assassin'];
    classKeys.forEach((key, i) => {
      if (k.consume(key)) this.command({ type: 'setClass', classId: classIds[i]! });
    });
    if (k.consume('roomNext')) this.command({ type: 'changeRoom', roomId: this.neighborRoom(1) });
    if (k.consume('roomPrev')) this.command({ type: 'changeRoom', roomId: this.neighborRoom(-1) });
    if (k.consume('auto')) this.command({ type: 'toggleAuto' });
  }

  /** HUD 與快捷鍵的操作。 */
  command(cmd: GameCommand): void {
    switch (cmd.type) {
      case 'stepBet': {
        const levels = this.betLevels();
        const current = levels.indexOf(this.bet);
        const next = levels[Math.max(0, Math.min(levels.length - 1, current + cmd.delta))];
        if (next !== undefined) this.betIndex = this.bundle.betLevels.findIndex((l) => l.bet === next);
        break;
      }
      case 'setBet':
        this.betIndex = Math.max(0, this.bundle.betLevels.findIndex((l) => l.bet === cmd.bet));
        this.clampBet();
        break;
      case 'setClass':
        this.setClass(cmd.classId);
        break;
      case 'changeRoom':
        void this.changeRoom(cmd.roomId, 'menu', 'spawn');
        break;
      case 'toggleDebug':
        this.colliders = !this.colliders;
        this.mapView?.setDebug(this.colliders);
        break;
      case 'toggleAuto':
        if (this.ready) this.setAuto(!this.autoOn);
        break;
      case 'setAutoConfig':
        this.auto.config = structuredClone(cmd.config);
        saveAutoConfig(this.auto.config);
        break;
    }
    this.emitHud({});
  }

  press(action: Parameters<InputState['press']>[0]): void {
    this.keys?.press(action);
  }

  release(action: Parameters<InputState['release']>[0]): void {
    this.keys?.release(action);
  }

  private neighborRoom(delta: 1 | -1): number {
    const ids = this.bundle.rooms.map((r) => r.id).sort((a, b) => a - b);
    const index = ids.indexOf(this.roomId);
    return ids[(index + delta + ids.length) % ids.length] ?? this.roomId;
  }

  private checkPortals(up: boolean): void {
    const map = this.mapView?.map;
    if (!map || !up || this.player.body.climb !== null) return;
    const body = this.player.body;
    for (const portal of map.portals) {
      if (portal.type === 'spawn') continue;
      if (Math.abs(body.x - portal.x) > 16 || Math.abs(body.y - portal.y) > 24) continue;
      const target = portal.type === 'toRoom' && portal.toRoom ? portal.toRoom : this.neighborRoom(portal.type === 'next' ? 1 : -1);
      void this.changeRoom(target, 'portal', portal.type === 'prev' ? 'prev' : 'next');
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 職業與外觀
  // ---------------------------------------------------------------------------

  private setClass(classId: ClassId): void {
    const classDef = this.bundle.classes.get(classId);
    if (!classDef || classId === this.classId) return;
    this.classId = classId;
    this.player.setClass(classDef);
    this.auto.reset();
    this.applyLoadout();
    this.showToast(`切換職業：${classDef.name}`);
  }

  /** 人物固定，只換成這個職業的武器（SPEC v0.6 §4.3）。 */
  private applyLoadout(): void {
    const classDef = this.bundle.classes.get(this.classId)!;
    this.avatar.setLoadout({ weapon: classDef.weapon });
  }

  private poseDuration(tag: string): number {
    const info = this.bundle.base.sheet.tags.get(tag);
    if (!info) return 0;
    let total = 0;
    for (let f = info.from; f <= info.to; f += 1) total += this.bundle.base.sheet.frame('body', f)?.durationMs ?? 100;
    return total;
  }

  // ---------------------------------------------------------------------------
  // 戰鬥：一刀一注（SPEC §3.1、§3.4）
  // ---------------------------------------------------------------------------

  private get bet(): number {
    return this.bundle.betLevels[this.betIndex]?.bet ?? 1;
  }

  private get betTier(): number {
    return this.bundle.betLevels[this.betIndex]?.visualTier ?? 1;
  }

  private betLevels(): number[] {
    return this.bundle.betLevels.map((l) => l.bet).filter((bet) => bet >= this.betRange[0] && bet <= this.betRange[1]);
  }

  private clampBet(): void {
    const levels = this.betLevels();
    if (levels.length === 0) return;
    if (!levels.includes(this.bet)) {
      const closest = levels.reduce((best, bet) => (Math.abs(bet - this.bet) < Math.abs(best - this.bet) ? bet : best), levels[0]!);
      this.betIndex = this.bundle.betLevels.findIndex((l) => l.bet === closest);
    }
  }

  private get displayBalance(): number {
    return this.serverBalance - this.pendingCost;
  }

  private onSkillStart(skill: SkillDef): boolean {
    if (!skill.blink) return true;
    const body = this.player.body;
    let best: MonsterActor | null = null;
    for (const m of this.monsters.values()) {
      if (!m.alive || Math.abs(m.x - body.x) > 320 || Math.abs(m.y - body.y) > 90) continue;
      if (!best || Math.abs(m.x - body.x) < Math.abs(best.x - body.x)) best = m;
    }
    if (!best) {
      this.showToast('附近沒有目標');
      return false;
    }
    const side = best.x >= body.x ? 1 : -1;
    const x = best.x + side * 22;
    const ground = this.world.groundBelow(x, best.y - 40);
    this.fx.spawn('dust', body.x, body.y - 10);
    body.x = Phaser.Math.Clamp(x, PHYSICS.halfWidth, this.world.width - PHYSICS.halfWidth);
    if (ground) {
      body.y = ground.y;
      body.ground = ground.fh;
    }
    body.facing = side === 1 ? -1 : 1;
    this.prevPlayer = { x: body.x, y: body.y };
    return true;
  }

  private onRoll(): void {
    this.fx.spawn('dust', this.player.body.x, this.player.body.y - 10);
  }

  private onLand(impact: number): void {
    if (impact > 300) this.fx.spawn('dust', this.player.body.x, this.player.body.y - 10);
  }

  private onStrike(skill: SkillDef, index: number): void {
    const strike = skill.strikes[index]!;
    const body = this.player.body;
    const dir = body.facing;
    const tint = TIER_TINT[this.betTier] ?? 0xffffff;
    const fxId = skill.slashFx ?? skill.fx;
    if (fxId) {
      const offset = skill.slashFx ? 22 : 30;
      this.fx.spawn(fxId, body.x + dir * offset, body.y - 26, { flipX: dir === 1, tint, additive: true, rainbow: this.betTier >= 5 });
    }
    if (skill.projectile) {
      const asset = this.bundle.fx.get(skill.projectile.fx);
      if (!asset) return;
      const sprite = this.add.sprite(body.x + dir * 14, body.y - 26, asset.path, '0').setDepth(DEPTH.fx).setFlipX(dir === 1);
      sprite.setTint(tint);
      this.projectiles.push({ sprite, lastX: body.x, x: body.x + dir * 14, y: body.y - 26, dir, speed: skill.projectile.speed, remaining: strike.area.w ?? 300, skill, strike: index });
      return;
    }
    const targets = this.findTargets(strike.area, strike.maxTargets, strike.pierce);
    this.applyHits(skill, index, targets);
  }

  private stepProjectiles(): void {
    const dt = PHYSICS.dt;
    this.projectiles = this.projectiles.filter((p) => {
      const move = p.speed * dt;
      p.x += p.dir * move;
      p.remaining -= move;
      const x1 = Math.min(p.lastX, p.x);
      const x2 = Math.max(p.lastX, p.x);
      // 掃過的區段內最靠近起點的那隻
      let hit: MonsterActor | undefined;
      for (const m of this.monsters.values()) {
        if (!m.alive || !sweepHits(m.hitbox(), x1, x2, p.y, 4)) continue;
        if (!hit || Math.abs(m.center().x - p.lastX) < Math.abs(hit.center().x - p.lastX)) hit = m;
      }
      p.lastX = p.x;
      if (hit) {
        this.applyHits(p.skill, p.strike, [hit]);
        const box = hit.hitbox();
        this.fx.spawn('hit_spark', Phaser.Math.Clamp(p.x, box.x, box.x + box.w), p.y, { additive: true });
      }
      if (hit || p.remaining <= 0) {
        p.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /** 範圍內的怪物，依距離排序取前 maxTargets 隻。 */
  private findTargets(area: Area, maxTargets: number, pierce: boolean): MonsterActor[] {
    const body = this.player.body;
    const dir = body.facing;
    const cy = body.y - 24;
    const candidates: { m: MonsterActor; d: number }[] = [];
    for (const m of this.monsters.values()) {
      if (!m.alive) continue;
      const box = m.hitbox();
      let inside = false;
      switch (area.shape) {
        case 'rect':
        case 'line': {
          const near = body.x + dir * (area.offsetX ?? 0);
          const far = near + dir * (area.w ?? 0);
          const h = area.h ?? 24;
          inside = intersects(box, { x: Math.min(near, far), y: cy - h / 2, w: Math.abs(far - near), h });
          break;
        }
        case 'circle':
          inside = circleRect(body.x, cy, area.r ?? 0, box);
          break;
        case 'sector':
          inside = circleRect(body.x, cy, area.r ?? 0, box) && (box.x + box.w / 2 - body.x) * dir >= -8;
          break;
        case 'screen':
          inside = intersects(box, this.cameras.main.worldView);
          break;
      }
      if (inside) candidates.push({ m, d: Math.hypot(box.x + box.w / 2 - body.x, box.y + box.h / 2 - cy) });
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates.slice(0, pierce ? maxTargets : 1).map((c) => c.m);
  }

  /** 命中：立刻播演出，再把這一刀送去判定（揮空不扣款）。 */
  private applyHits(skill: SkillDef, index: number, targets: MonsterActor[]): void {
    if (targets.length === 0) return;
    const bet = this.bet;
    if (this.displayBalance < bet) {
      if (this.autoOn) this.setAuto(false, '餘額不足');
      else this.showToast('餘額不足，請降低押注');
      return;
    }
    const classDef = this.bundle.classes.get(this.classId)!;
    const [minDamage, maxDamage] = classDef.damage;
    const body = this.player.body;
    for (const m of targets) {
      m.onHit(body.x);
      m.pending += 1;
      const c = m.center();
      const crit = Math.random() < 0.15;
      const damage = Math.round((minDamage + Math.random() * (maxDamage - minDamage)) * (crit ? 1.8 : 1));
      // 楓之谷式往上疊：同一隻怪在短時間內的傷害數字一層層往上
      const now = this.time.now;
      const last = this.damageStacks.get(m.spawn.uid);
      const stack = last && now - last.at < 450 ? (last.count + 1) % 6 : 0;
      this.damageStacks.set(m.spawn.uid, { count: stack, at: now });
      this.fx.damage(c.x, m.hitbox().y - 2, damage, { crit, stack });
      this.fx.spawn('hit_spark', c.x + (Math.random() - 0.5) * 8, c.y + (Math.random() - 0.5) * 8, { additive: true, tint: TIER_TINT[this.betTier] });
    }
    this.hitStopMs = Math.max(this.hitStopMs, skill.hitStopMs);
    if (skill.shake > 0) this.cameras.main.shake(90, skill.shake / this.cameras.main.worldView.width);

    const seq = ++this.seq;
    this.pendingCost += bet;
    this.server
      .attack({ seq, skillId: skill.id, strike: index, bet, targets: targets.map((m) => m.spawn.uid) })
      .then((result) => this.onAttackResult(result, bet))
      .catch(() => {
        this.pendingCost -= bet;
      });
  }

  private onAttackResult(result: AttackResult, bet: number): void {
    this.pendingCost -= bet;
    this.serverBalance = result.balance;
    if (result.error === 'INSUFFICIENT_BALANCE') this.showToast('餘額不足，請降低押注');
    else if (result.error === 'BET_OUT_OF_RANGE') this.showToast('押注超出本房範圍');
    for (const outcome of result.results) {
      const monster = this.monsters.get(outcome.uid);
      if (!monster) continue;
      monster.pending = Math.max(0, monster.pending - 1);
      if (!outcome.killed) continue;
      const c = monster.center();
      const floor = monster.y;
      const coins = Math.min(30, monster.def.fx.coinCount + Math.floor(outcome.multiplier / 10));
      monster.kill(() => {
        this.fx.coins(c.x, c.y, coins, floor);
        this.fx.spawn(monster.def.fx.die ?? 'dust', c.x, c.y, { additive: monster.def.fx.die === 'explosion' });
      });
      this.onPayout(outcome.payout, outcome.multiplier, c);
    }
    this.emitHud({});
  }

  private onPayout(payout: number, multiplier: number, at: { x: number; y: number }): void {
    const text = this.add
      .text(Math.round(at.x), Math.round(at.y - 18), `+${payout.toLocaleString()}`, {
        fontFamily: 'monospace',
        fontSize: multiplier >= 50 ? '16px' : '12px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#3a2400',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.numbers + 1)
      .setResolution(3);
    this.tweens.add({ targets: text, y: text.y - 26, alpha: { from: 1, to: 0 }, delay: 500, duration: 600, onComplete: () => text.destroy() });

    const stopMultiple = this.auto.config.stop.payoutMultipleAtLeast;
    if (this.autoOn && stopMultiple !== null && multiplier >= stopMultiple) this.setAuto(false, `單次派彩 ×${multiplier}`);

    if (multiplier >= BIG_WIN.big) {
      this.hitStopMs = Math.max(this.hitStopMs, 100);
      this.slowMoMs = 300;
      this.cameras.main.shake(200, 4 / this.cameras.main.worldView.width);
      const level = multiplier >= BIG_WIN.super ? 'super' : multiplier >= BIG_WIN.mega ? 'mega' : 'big';
      this.bigWin = { id: ++this.uiId, level, amount: payout, multiple: multiplier };
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private showToast(text: string): void {
    this.toast = { id: ++this.uiId, text };
    this.emitHud({});
  }

  private emitHud(patch: Partial<HudState>): void {
    if (!this.opts.onHud) return;
    const classDef = this.bundle.classes.get(this.classId);
    const skillInfo = (slot: 'skill1' | 'skill2', id: string | undefined) => {
      const skill = id ? this.bundle.skills.get(id) : undefined;
      return { slot, id: id ?? '', name: skill?.name ?? '', cooldownMs: this.ready && id ? this.player.cooldown(id) : 0, totalMs: (skill?.cooldownSec ?? 0) * 1000 };
    };
    this.opts.onHud({
      loading: !this.ready,
      balance: this.displayBalance,
      bet: this.bet,
      betLevels: this.betLevels(),
      betTier: this.betTier,
      roomId: this.roomId,
      roomName: this.roomName,
      rooms: this.bundle.rooms.map((r) => ({ id: r.id, name: r.name, betRange: r.betRange, lineup: r.lineup ?? [] })),
      classId: this.classId,
      classes: [...this.bundle.classes.values()].map((c) => ({ id: c.id, name: c.name })),
      skills: [skillInfo('skill1', classDef?.skills[0]), skillInfo('skill2', classDef?.skills[1])],
      auto: this.autoOn,
      ...(this.autoOn
        ? {
            autoStatus: this.autoDriving ? this.auto.status : ('paused' as const),
            autoSession: { net: this.displayBalance - this.autoSession.startBalance, elapsedMs: performance.now() - this.autoSession.startedAt },
          }
        : {}),
      autoConfig: this.auto.config,
      fps: Math.round(this.game.loop.actualFps),
      ...(this.toast ? { toast: this.toast } : {}),
      ...(this.bigWin ? { bigWin: this.bigWin } : {}),
      ...patch,
    });
  }

  /** 效能量測用（scripts/shot.mjs 會讀）。 */
  stats(): Record<string, number> {
    return {
      fps: Math.round(this.game.loop.actualFps),
      monsters: this.monsters.size,
      fx: this.fx.count,
      lights: this.lights.getLightCount(),
      x: Math.round(this.player?.body.x ?? 0),
      y: Math.round(this.player?.body.y ?? 0),
      ground: this.player?.body.ground ?? -1,
      climb: this.player?.body.climb ?? -1,
      room: this.roomId,
      balance: this.displayBalance,
      auto: this.autoOn ? 1 : 0,
      ...(this.autoOn ? this.auto.debugInfo() : {}),
    };
  }

  private teardown(): void {
    this.dead = true;
    for (const off of this.unsubscribes) off();
    this.server?.dispose();
    this.keys?.dispose();
  }
}

function intersects(a: Rect, b: { x: number; y: number; width?: number; height?: number; w?: number; h?: number }): boolean {
  const bw = b.w ?? b.width ?? 0;
  const bh = b.h ?? b.height ?? 0;
  return a.x < b.x + bw && a.x + a.w > b.x && a.y < b.y + bh && a.y + a.h > b.y;
}

function circleRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

/** 水平線段 [x1, x2]（高度 y）是否碰到 rect。 */
function sweepHits(rect: Rect, x1: number, x2: number, y: number, pad: number): boolean {
  return x2 >= rect.x - pad && x1 <= rect.x + rect.w + pad && y >= rect.y - pad && y <= rect.y + rect.h + pad;
}

function loadAutoConfig(): AutoConfig {
  const config = structuredClone(DEFAULT_AUTO_CONFIG);
  try {
    const saved = JSON.parse(localStorage.getItem(AUTO_CONFIG_KEY) ?? 'null') as Partial<AutoConfig> | null;
    if (saved && typeof saved === 'object') return { ...config, ...saved, stop: { ...config.stop, ...saved.stop } };
  } catch {
    // 存檔壞掉或無法讀取：用預設值
  }
  return config;
}

function saveAutoConfig(config: AutoConfig): void {
  try {
    localStorage.setItem(AUTO_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 無痕模式等情況無法存，忽略
  }
}
