import * as Phaser from 'phaser';
import {
  FootholdWorld,
  PHYSICS,
  DEFAULT_RTP,
  buildNavGraph,
  strikeCostMultiplier,
  type Area,
  type AvatarLoadout,
  type ClassId,
  type MapDef,
  type NavGraph,
  type Rect,
  type RoomDef,
  type SkillCue,
  type SkillDef,
  type SkillMove,
  type Strike,
} from '@lawn/shared';
import { Player, type PlayerInput } from '../actor/Player';
import { BgmPlayer } from '../audio/BgmPlayer';
import { sfx, type SfxPlayOptions } from '../audio/Sfx';
import { SFX_CUES } from '../audio/sfxCues';
import { AutoHunt, DEFAULT_AUTO_CONFIG, type AutoConfig, type AutoSkill } from '../auto/AutoHunt';
import { AvatarView } from '../avatar/AvatarView';
import { loadHeroMotions, motionDuration } from '../avatar/motions';
import { loadOutfitArt } from '../avatar/outfits';
import { loadInventoryArt } from '../inventory/loadArt';
import { WEAPON_BY_ID } from '../inventory/catalog';
import type { InventorySnapshot } from '../inventory/model';
import type { ContentBundle, SheetAsset } from '../content/bundle';
import { InputState, SKILL_ACTIONS } from '../core/input';
import { FxLayer, TIER_TINT } from '../feel/FxLayer';
import { Pickups } from '../feel/Pickups';
import { ComboTracker } from '../feel/ComboTracker';
import { SkillFx, type FxPoint, type SkillFxContext } from '../feel/SkillFx';
import { createClassProjectile, orientSkillWeapon } from '../feel/SkillWeapons';
import { impactFeel } from '../feel/SkillPresentation';
import type { GameCommand, GameMode, HudState } from '../hud';
import { DEPTH, MapView } from '../map/MapView';
import { landmarkBgm } from '../map/LandmarkScenery';
import { MonsterActor } from '../monster/MonsterActor';
import { isThemedMonsterSheet } from '../monster/themedRoster';
import { loadSheetAssets } from '../render/sheets';
import { LocalServer } from '../server/LocalServer';
import type { AttackResult, GameServer, MonsterSpawn, Snapshot } from '../server/types';

export const INTERNAL_HEIGHT = 540;
const STEP_MS = PHYSICS.dt * 1000;
const BIG_WIN = { big: 50, mega: 100, super: 300 } as const;
/** 手動介入後多久恢復掛機（SPEC §3.6） */
const AUTO_RESUME_MS = 3000;
const AUTO_CONFIG_KEY = 'lawn.autoConfig';
const MODE_KEY = 'lawn.mode';
const HOTBAR_SLOTS = 8;
/** 換層位移（昇龍斬、瞬移術）落點跟角色至少差這麼多，才會斜上斜下 */
const TIER_MIN_DX = 160;
/** 進房後多久開始在背景預載相鄰房間（先讓背景音樂與畫面穩定） */
const PREFETCH_DELAY_MS = 1500;

export interface GameSceneOptions {
  bundle: ContentBundle;
  roomId?: number;
  mapOverride?: MapDef;
  classId?: ClassId;
  mode?: GameMode;
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
  lastY: number;
  x: number;
  y: number;
  /** 飛行方向（弧度，0 = 往右） */
  angle: number;
  speed: number;
  remaining: number;
  skill: SkillDef;
  strike: number;
  /** 瞄準的目標（SPEC §3.4）；死掉後沿目前方向直飛 */
  target: MonsterActor | null;
  /** 追蹤：每秒最多轉幾弧度 */
  turn: number;
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
  private queuedMonsterSpawns: MonsterSpawn[] = [];
  private projectiles: Projectile[] = [];
  private accumulator = 0;
  private hitStopMs = 0;
  private readonly comboTracker = new ComboTracker();
  private slowMoMs = 0;
  private ready = false;
  private switching = false;
  private seq = 0;
  private serverBalance = 0;
  private inventoryOpen = false;
  private inventoryState: InventorySnapshot | undefined;
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
  /** 相鄰房間預載：排程與進行中的下載 */
  private prefetchTimer: Phaser.Time.TimerEvent | null = null;
  private readonly prefetching = new Map<number, Promise<void>>();
  /** 掉落物：金幣、武器、卷軸（落地漂浮後吸到玩家身上） */
  private pickups!: Pickups;
  private bgm!: BgmPlayer;
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
  private skillFx!: SkillFx;
  private mode: GameMode = 'real';
  /** 散射技能（分身飛鏢、影分身）：這次施放挑好的點 */
  private scatter: { skillId: string; points: FxPoint[] } | null = null;
  /** 連鎖技能：這次施放已經打過的怪與上一個點 */
  private chain: { skillId: string; hit: Set<number>; last: FxPoint | null } | null = null;

  constructor() {
    super('game');
  }

  init(options: GameSceneOptions): void {
    this.opts = options;
    this.bundle = options.bundle;
    this.classId = options.classId ?? 'warrior';
    this.colliders = options.showColliders ?? false;
    this.auto.config = loadAutoConfig();
    this.mode = options.mode ?? loadMode();
  }

  create(): void {
    this.keys = new InputState(window);
    this.keys.onManualInput = () => this.pauseAutoForManual();
    this.fx = new FxLayer(this, this.bundle);
    this.pickups = new Pickups(this, this.bundle);
    this.pickups.target = () => ({ x: this.player?.body.x ?? 0, y: (this.player?.body.y ?? 0) - 26 });
    this.pickups.world = () => this.world ?? null;
    this.pickups.onCollect = (x, y, kind) => {
      this.fx.spawn('hit_spark', x, y, { additive: true, scale: kind === 'item' ? 1.4 : 0.7 });
      this.collectSound(kind);
    };
    this.skillFx = new SkillFx(this, this.bundle, this.fx, () => this.opts.lighting !== false);
    this.bgm = new BgmPlayer(this.bundle.source);
    // 音效左右聲道跟著鏡頭
    sfx.listener = this.sfxListener;
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
      ...[...bundle.monsters.values()].map((entry) => entry.sheet).filter(sheet => !isThemedMonsterSheet(sheet.path)),
      ...bundle.fx.values(),
    ]);
    await loadHeroMotions(this);
    await loadInventoryArt(this);
    await loadOutfitArt(this);
    await SkillFx.preload(this);
    if (this.dead) return;
    this.server = new LocalServer(bundle, { spawnScale: this.opts.spawnScale ?? 1 });
    this.inventoryState = this.server.inventorySnapshot();
    this.unsubscribes.push(
      this.server.on('balance', ({ balance }) => { this.serverBalance = balance; }),
      this.server.on('inventory', (snapshot) => {
        this.inventoryState = snapshot;
        this.applyLoadout();
        if (snapshot.feedback?.kind === 'drop') this.showToast(snapshot.feedback.message);
        this.emitHud({});
      }),
      this.server.on('monsterSpawn', (spawn) => {
        if (!this.ready || this.switching) this.queuedMonsterSpawns.push(spawn);
        else this.spawnMonster(spawn);
      }),
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
      { pose: (tag) => this.poseDuration(tag), motion: motionDuration },
      this.avatar,
      {
        onStrike: (skill, index) => this.onStrike(skill, index),
        onCue: (skill, cue) => this.onCue(skill, cue),
        onMove: (skill, move) => this.onMove(skill, move),
        onSkillStart: (skill) => this.onSkillStart(skill),
        onRoll: () => this.onRoll(),
        resolveSlot: (slot) => this.resolveSlot(slot),
        onLand: (impact) => this.onLand(impact),
        onJump: (air) => this.playSfx(air ? 'airJump' : 'jump'),
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
    this.comboTracker.reset();
    this.cancelPrefetch();
    const map = this.opts.mapOverride ?? (await this.bundle.loadMap(snapshot.mapId));
    const theme = this.bundle.themes.get(map.theme);
    const room = this.bundle.rooms.find(r => r.id === snapshot.roomId);
    const sheets = this.roomSheets(room, map, snapshot.monsters.map(spawn => spawn.typeId));
    // 背景、地形與怪物圖同時下載；相鄰房間預載過的直接用
    await Promise.all([MapView.preload(this, this.bundle.source, map, theme), loadSheetAssets(this, this.bundle.source, sheets)]);
    if (this.dead) return;

    this.mapView?.destroy();
    for (const monster of this.monsters.values()) monster.destroy();
    this.monsters.clear();
    for (const p of this.projectiles) p.sprite.destroy();
    this.projectiles = [];
    this.fx.destroy();
    this.pickups.clear();
    this.skillFx.clear();

    // 主題怪物圖很大：只留這一房與相鄰兩房的（相鄰的是預載來的），其他釋放
    const keep = new Set([...sheets, ...this.neighborIds(snapshot.roomId).flatMap((id) => this.roomSheets(this.bundle.rooms.find((r) => r.id === id)))].map((sheet) => sheet.path));
    for (const key of this.textures.getTextureKeys()) if (isThemedMonsterSheet(key) && !keep.has(key)) this.textures.remove(key);

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

    this.roomId = snapshot.roomId;
    this.roomName = room?.name ?? map.name;
    // 房間設定優先，其次景點的專屬曲子（九份、京都…），最後地圖；同一首不重播。怪潮目前沒有專屬曲子，維持房間 BGM（SPEC §4.6）
    this.bgm.play(room?.bgm ?? landmarkBgm(map) ?? map.bgm);
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
    for (const spawn of this.queuedMonsterSpawns.splice(0)) {
      if (!this.monsters.has(spawn.uid) && map.spawnZones.some(zone => zone.id === spawn.zoneId)) this.spawnMonster(spawn);
    }

    const camera = this.cameras.main;
    const bounds = map.cameraBounds;
    camera.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    this.cameraTarget.setPosition(body.x, body.y - 30);
    camera.startFollow(this.cameraTarget, false, 0.12, 0.12);
    camera.setDeadzone(48, 36);
    this.applyZoom();
    camera.centerOn(body.x, body.y - 30);
    camera.fadeIn(250, 0, 0, 0);
    // 進房穩定後（背景音樂先開始緩衝）再在背景預載相鄰房間，換過去幾乎不用等
    if (!this.opts.mapOverride) this.prefetchTimer = this.time.delayedCall(PREFETCH_DELAY_MS, () => {
      for (const id of this.neighborIds(this.roomId)) void this.prefetchRoom(id);
    });
  }

  /** 這一房會用到的怪物圖：地圖的生怪區、房間的怪物組成、怪潮、Boss，加上目前場上的怪。 */
  private roomSheets(room: RoomDef | undefined, map?: MapDef, extra: string[] = []): SheetAsset[] {
    const ids = new Set([...(map?.spawnZones.flatMap((zone) => zone.pool.map((entry) => entry.mobId)) ?? []), ...extra]);
    for (const id of room?.lineup ?? []) ids.add(id);
    for (const entry of room?.wave?.pool ?? []) ids.add(entry.mobId);
    if (room?.boss) ids.add(room.boss.mobId);
    return [...ids].flatMap((id) => this.bundle.monsters.get(id)?.sheet ?? []);
  }

  /** 上一房、下一房（依房間編號排序，頭尾相接）。 */
  private neighborIds(roomId: number): number[] {
    const ids = this.bundle.rooms.map((r) => r.id).sort((a, b) => a - b);
    const index = ids.indexOf(roomId);
    if (index < 0 || ids.length < 2) return [];
    return [...new Set([ids[(index + 1) % ids.length]!, ids[(index - 1 + ids.length) % ids.length]!])].filter((id) => id !== roomId);
  }

  /** 預先下載一間房的地圖、背景、地形與怪物圖（已經有的跳過；同一間同時只跑一次）。 */
  private prefetchRoom(roomId: number): Promise<void> {
    const running = this.prefetching.get(roomId);
    if (running) return running;
    const room = this.bundle.rooms.find((r) => r.id === roomId);
    if (!room) return Promise.resolve();
    const task = (async () => {
      const map = await this.bundle.loadMap(room.mapId);
      if (this.dead) return;
      await Promise.all([
        MapView.preload(this, this.bundle.source, map, this.bundle.themes.get(map.theme)),
        loadSheetAssets(this, this.bundle.source, this.roomSheets(room, map)),
      ]);
    })()
      .catch(() => undefined)
      .finally(() => this.prefetching.delete(roomId));
    this.prefetching.set(roomId, task);
    return task;
  }

  private cancelPrefetch(): void {
    this.prefetchTimer?.remove(false);
    this.prefetchTimer = null;
  }

  private async changeRoom(roomId: number, via: 'portal' | 'menu', arriveAt: 'spawn' | 'next' | 'prev'): Promise<void> {
    if (this.switching || roomId === this.roomId) return;
    this.switching = true;
    // 一按換房就開始下載新房間（跟淡出、伺服器換房同時進行）
    void this.prefetchRoom(roomId);
    try {
      const camera = this.cameras.main;
      camera.fadeOut(200, 0, 0, 0);
      this.playSfx('portal');
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
    if (this.inventoryOpen) {
      this.keys.clear();
      this.hudElapsed += delta;
      if (this.hudElapsed >= 100) { this.hudElapsed = 0; this.emitHud({}); }
      return;
    }
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
        // 重擊發生的這一步立即停住，低幀率下也不會同一幀跑完後續數步。
        if (this.hitStopMs > 0) { this.accumulator = 0; break; }
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
    for (const p of this.projectiles) {
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      if(animDt>0)this.skillFx.projectileTrail(p.skill,p.sprite,p.angle);
    }
    this.fx.update(animDt === 0 ? 0 : frameMs, this.hitStopMs > 0);
    this.pickups.update(animDt === 0 ? 0 : frameMs, this.hitStopMs > 0);
    this.mapView?.update(frameMs, this.cameras.main);

    this.hudElapsed += frameMs;
    if (this.hudElapsed >= 100) {
      this.hudElapsed = 0;
      this.checkAutoStop();
      this.emitHud({});
    }
  }

  private fixedStep(): void {
    if (this.inventoryOpen) { this.keys.clear(); return; }
    this.comboTracker.step(STEP_MS);
    const k = this.keys;
    const manual: PlayerInput = {
      x: k.axisX(),
      up: k.isHeld('up'),
      down: k.isHeld('down'),
      jumpPressed: k.consume('jump'),
      jumpHeld: k.isHeld('jump'),
      attack: k.consume('attack') || k.isHeld('attack'),
      secondary: k.consume('secondary'),
      skill: SKILL_ACTIONS.findIndex((action) => k.consume(action)),
      roll: k.consume('roll'),
    };
    // 按住任何移動或攻擊鍵：掛機持續暫停，放開 3 秒後恢復
    if (manual.x !== 0 || manual.up || manual.down || manual.jumpHeld || manual.attack || manual.secondary || manual.skill >= 0) this.pauseAutoForManual();
    const driving = this.autoDriving;
    const input = driving ? this.stepAuto() : manual;
    this.skillFx.step(STEP_MS);
    this.player.step(this.world, input);
    for (const monster of this.monsters.values()) monster.step();
    this.stepProjectiles();
    // 掛機只有在「前往傳送點」時才會用 ↑ 換房，爬繩時按 ↑ 不會誤觸旁邊的傳送點
    this.checkPortals(driving ? input.up && this.auto.status === 'portal' : manual.up);
  }

  private get autoDriving(): boolean {
    return !this.inventoryOpen && this.autoOn && performance.now() >= this.autoPausedUntil;
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
      skills: this.autoSkills(),
    });
  }

  /** 掛機可用的技能：技能列（大技能）優先，再來常駐小技能。 */
  private autoSkills(): AutoSkill[] {
    const classDef = this.bundle.classes.get(this.classId)!;
    const list: AutoSkill[] = [];
    for (let slot = 0; slot < HOTBAR_SLOTS; slot += 1) {
      const id = this.resolveSlot(slot);
      const skill = id ? this.bundle.skills.get(id) : undefined;
      if (skill) list.push({ skill, press: { skill: slot }, ready: this.player.canUse(skill.id) });
    }
    const secondary = classDef.secondary ? this.bundle.skills.get(classDef.secondary) : undefined;
    if (secondary) list.push({ skill: secondary, press: { secondary: true }, ready: this.player.canUse(secondary.id) });
    return list;
  }

  // ---------------------------------------------------------------------------
  // 技能列與技能押注倍數（SPEC §3.1、§3.3）
  // ---------------------------------------------------------------------------

  private resolveSlot(slot: number): string | null {
    return this.bundle.classes.get(this.classId)?.skills[slot] ?? null;
  }

  /** 技能放一次（每一刀都打滿）的押注倍數；開發模式一律每刀 1 倍。 */
  private skillPrice(skillId: string): number {
    if (this.mode === 'dev') return 1;
    return this.bundle.skills.get(skillId)?.price ?? 1;
  }

  private setMode(mode: GameMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    saveMode(mode);
    this.showToast(mode === 'dev' ? '開發模式：技能每刀只算 1 倍（測試用）' : '實際模式：技能依價格扣押注倍數');
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
    this.playSfx(on ? 'ui:autoOn' : 'ui:autoOff', { x: undefined });
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
    if (k.consume('roomNext')) this.command({ type: 'changeRoom', roomId: this.neighborRoom(1) });
    if (k.consume('roomPrev')) this.command({ type: 'changeRoom', roomId: this.neighborRoom(-1) });
    if (k.consume('auto')) this.command({ type: 'toggleAuto' });
  }

  /** HUD 與快捷鍵的操作。 */
  command(cmd: GameCommand): void {
    switch (cmd.type) {
      case 'inventoryOpen':
        this.inventoryOpen = cmd.open;
        this.keys?.clear();
        this.pauseAutoForManual();
        break;
      case 'inventory': {
        if (!this.ready) break;
        const before = this.serverBalance;
        // 'balance' 事件是同步送出的，manageInventory 回來時 serverBalance 已經是新值
        this.server.manageInventory(cmd.action, this.mode === 'dev');
        // 清空重置會把金幣改回初始值：掛機的累計輸／贏基準跟著平移（同 setBalance）
        if (cmd.action.type === 'reset') this.autoSession.startBalance += this.serverBalance - before;
        break;
      }
      case 'stepBet': {
        const levels = this.betLevels();
        const current = levels.indexOf(this.bet);
        const next = levels[Math.max(0, Math.min(levels.length - 1, current + cmd.delta))];
        if (next !== undefined && next !== this.bet) this.playSfx(cmd.delta > 0 ? 'ui:betUp' : 'ui:betDown', { x: undefined });
        if (next !== undefined) this.betIndex = this.bundle.betLevels.findIndex((l) => l.bet === next);
        break;
      }
      case 'setBet':
        this.playSfx(cmd.bet >= this.bet ? 'ui:betUp' : 'ui:betDown', { x: undefined });
        this.betIndex = Math.max(0, this.bundle.betLevels.findIndex((l) => l.bet === cmd.bet));
        this.clampBet();
        break;
      case 'setClass':
        if (cmd.classId !== this.classId) this.playSfx('ui:class', { x: undefined });
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
      case 'setMode':
        this.setMode(cmd.mode);
        break;
      case 'setBalance': {
        // 掛機的累計輸／贏以開始時的餘額計算：跟著平移，改金錢不會被當成輸贏而觸發停止
        const before = this.serverBalance;
        this.serverBalance = this.server.setBalance(cmd.balance);
        this.autoSession.startBalance += this.serverBalance - before;
        break;
      }
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
    this.comboTracker.reset();
    this.skillFx.clear();
    this.classId = classId;
    this.player.setClass(classDef);
    this.auto.reset();
    this.applyLoadout();
    this.showToast(`切換職業：${classDef.name}`);
  }

  /** 職業武器分開保存，套服則由所有職業共用。 */
  private applyLoadout(): void {
    const classDef = this.bundle.classes.get(this.classId)!;
    this.avatar.setLoadout({ weapon: classDef.weapon });
    const state = this.inventoryState?.inventory;
    this.avatar.setOutfit(state?.equippedOutfit ?? null);
    const item = state?.items.find((w) => w.uid === state.equipped[this.classId]);
    this.avatar.setCosmeticWeapon(item ? WEAPON_BY_ID.get(item.definitionId) ?? null : null);
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
    const begin = () => {
      this.skillFx.begin(skill,this.fxContext(skill,skill.strikes[0]!.area,[],null,0));
      // 起手音：普攻只放自己定義的，技能沒定義就用職業共通的
      this.playSfx(skill.kind === 'basic' ? [`cast:${skill.id}`] : [`cast:${skill.id}`, `cast:${skill.classId}`]);
      return true;
    };
    if (skill.chain?.blink) {
      // 影襲：第一刀的範圍內要有目標，不然不放（也不進冷卻）
      if (this.findTargets(skill.strikes[0]!.area, 1, false).length > 0) return begin();
      this.showToast('附近沒有目標');
      return false;
    }
    if (!skill.blink) return begin();
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
    this.teleportBehind(best);
    return begin();
  }

  /**
   * 瞬移到怪物背後、面向它。背後被牆擋住就停在牆邊；背後沒有落腳處改站到怪物前面；
   * 兩邊都找不到地面就留在原地（不會瞬移到牆外、掉出地圖）。
   */
  private teleportBehind(target: MonsterActor): void {
    const body = this.player.body;
    const behind = target.x >= body.x ? 1 : -1;
    const front = behind === 1 ? -1 : 1;
    // 先找附近有地面的一側，都沒有才接受「停在空中、之後落到下面的地面」（飛行怪）
    const spot =
      this.spotBeside(target, behind, true) ?? this.spotBeside(target, front, true) ?? this.spotBeside(target, behind, false) ?? this.spotBeside(target, front, false);
    if (!spot) return;
    this.fx.spawn('dust', body.x, body.y - 10);
    Object.assign(body, { x: spot.x, y: spot.y, ground: spot.fh, climb: null, vx: 0, vy: 0, facing: spot.side === 1 ? -1 : 1 });
    this.prevPlayer = { x: body.x, y: body.y };
  }

  /** 怪物 side 側 22 px 的落腳點。near = 只接受怪物腳下附近的地面；否則底下只要有地面就停在空中自然落下。 */
  private spotBeside(target: MonsterActor, side: 1 | -1, near: boolean): { x: number; y: number; fh: number | null; side: 1 | -1 } | null {
    const x = this.world.blockByWalls(target.x, target.x + side * 22, target.y - PHYSICS.height, target.y - 2, PHYSICS.halfWidth);
    const ground = this.world.groundBelow(x, target.y - 40);
    if (!ground) return null;
    if (ground.y - target.y < 120) return { x, y: ground.y, fh: ground.fh, side };
    return near ? null : { x, y: target.y + 20, fh: null, side };
  }

  /** 技能位移發動：瞬移在這裡處理，衝刺與跳躍的物理在 Player，這裡只加殘影與塵土。 */
  private onMove(_skill: SkillDef, move: SkillMove): void {
    const body = this.player.body;
    this.playSfx(`move:${move.kind}`);
    const ghost = () => {
      const frame = this.avatar.motionFrame;
      if (frame) this.skillFx.afterimage(frame, this.player.body.x, this.player.body.y, this.player.body.facing);
    };
    // 換層位移：上下兩層內怪最多的足場（SPEC §3.3），斜著過去
    const dest = move.kind === 'tierLeap' || move.kind === 'tierBlink' ? this.pickTierDestination(move.range, move.rise, move.fall) : null;
    if (move.kind === 'tierLeap') {
      this.fx.spawn('dust', body.x, body.y - 8, { flipX: body.facing === 1 });
      if (dest) this.launchTo(dest);
      else this.player.launch(body.facing * 230, 430, null); // 附近沒有更好的層：往前斜跳
      ghost();
      this.time.addEvent({ delay: 55, repeat: 8, callback: ghost });
      return;
    }
    if (move.kind === 'blink' || move.kind === 'tierBlink') {
      const before = { x: body.x, y: body.y };
      if (dest) {
        Object.assign(body, { x: dest.x, y: dest.y, ground: dest.fh, climb: null, vx: 0, vy: 0, facing: dest.x >= before.x ? 1 : -1 });
      }
      for (let distance = move.distance; !dest && distance >= 40; distance *= 0.7) {
        const wanted = Phaser.Math.Clamp(body.x + body.facing * distance, PHYSICS.halfWidth, this.world.width - PHYSICS.halfWidth);
        const x = this.world.blockByWalls(body.x, wanted, body.y - PHYSICS.height, body.y - 2, PHYSICS.halfWidth);
        const ground = this.world.groundBelow(x, body.y - 40);
        if (!ground || ground.y - body.y > 160) continue;
        Object.assign(body, { x, y: ground.y, ground: ground.fh, climb: null, vx: 0, vy: 0 });
        break;
      }
      const frame = this.avatar.motionFrame;
      if (frame) {
        const steps = dest ? 5 : 3;
        for (let i = 0; i < steps; i += 1) {
          const t = i / steps;
          this.skillFx.afterimage(frame, before.x + (body.x - before.x) * t, before.y + (body.y - before.y) * t, body.facing, 0xc59bff, 0.35 + t * 0.2);
        }
      }
      this.prevPlayer = { x: body.x, y: body.y };
      return;
    }
    this.fx.spawn('dust', body.x, body.y - 8, { flipX: body.facing === 1 });
    const span = move.kind === 'dash' ? move.durationMs + 40 : 320;
    const every = move.kind === 'dash' ? 25 : 55;
    ghost();
    this.time.addEvent({ delay: every, repeat: Math.max(0, Math.floor(span / every) - 1), callback: ghost });
  }

  /**
   * 換層位移的落點：左右 range、往上 rise／往下 fall 以內，依足場分組數怪，別層的怪多加權（要讓角色換層）。
   * 落點在那群怪中間，但跟角色至少差 TIER_MIN_DX，才會斜上斜下、不會直上直下。
   * 最好的地方就是現在這層時回傳 null。
   */
  private pickTierDestination(range: number, rise: number, fall: number): { x: number; y: number; fh: number } | null {
    const body = this.player.body;
    const groups = new Map<number, { xs: number[]; dy: number }>();
    for (const m of this.monsters.values()) {
      if (!m.alive || Math.abs(m.x - body.x) > range) continue;
      const fh = m.foothold ?? this.world.groundBelow(m.x, m.y - 2)?.fh;
      if (fh === undefined || fh === null) continue;
      const fy = this.world.footholdY(fh, m.x) ?? m.y;
      const dy = body.y - fy; // 正 = 在上面
      if (dy > rise || -dy > fall) continue;
      const group = groups.get(fh) ?? { xs: [], dy };
      group.xs.push(m.x);
      groups.set(fh, group);
    }
    let best: { fh: number; score: number; xs: number[]; dy: number } | null = null;
    for (const [fh, g] of groups) {
      const otherTier = Math.abs(g.dy) > 40;
      const score = g.xs.length * (otherTier ? 1.5 : 1);
      if (!best || score > best.score) best = { fh, score, xs: g.xs, dy: g.dy };
    }
    if (!best || Math.abs(best.dy) <= 40) return null;
    const xs = [...best.xs].sort((a, b) => a - b);
    const range2 = this.world.footholdRange(best.fh);
    if (!range2) return null;
    const lo = range2.x1 + PHYSICS.halfWidth + 4;
    const hi = range2.x2 - PHYSICS.halfWidth - 4;
    let x = Phaser.Math.Clamp(xs[Math.floor(xs.length / 2)]!, lo, hi);
    // 斜上斜下：跟角色至少差 TIER_MIN_DX，往怪群那一側（沒有就往面向）推
    if (Math.abs(x - body.x) < TIER_MIN_DX) {
      const dir: 1 | -1 = x === body.x ? body.facing : x > body.x ? 1 : -1;
      const pushed = body.x + dir * TIER_MIN_DX;
      const other = body.x - dir * TIER_MIN_DX;
      if (pushed >= lo && pushed <= hi) x = pushed;
      else if (other >= lo && other <= hi) x = other;
      else return null;
    }
    const y = this.world.footholdY(best.fh, x);
    return y === null ? null : { x, y, fh: best.fh };
  }

  /** 拋物線跳到 dest：頂點比起點與終點都高一點，往下跳時穿過腳下的單向平台。 */
  private launchTo(dest: { x: number; y: number; fh: number }): void {
    const body = this.player.body;
    const g = PHYSICS.gravity;
    const rise = body.y - dest.y; // 正 = 往上
    const apex = Math.max(48, rise + 48);
    const vy = Math.sqrt(2 * g * apex);
    const time = vy / g + Math.sqrt((2 * (apex - rise)) / g);
    const vx = Phaser.Math.Clamp((dest.x - body.x) / time, -700, 700);
    this.player.launch(vx, vy, rise < -8 ? body.ground : null);
  }

  /** 演出時點（隕石開始落下、迴旋刃飛出）。 */
  private onCue(skill: SkillDef, cue: SkillCue): void {
    const next = skill.strikes.find((strike) => strike.atMs >= cue.atMs) ?? skill.strikes[0]!;
    const cues = skill.cues ?? [];
    this.playSfx(`cue:${cue.fx}`, { index: cues.indexOf(cue), count: cues.length });
    this.skillFx.play(cue.fx,{ ...this.fxContext(skill, next.area, [], null, cue.atMs), leadMs: next.atMs - cue.atMs });
  }

  private fxContext(skill: SkillDef, area: Area, targets: MonsterActor[], from: FxPoint | null, atMs: number): SkillFxContext {
    const body = this.player.body;
    const view = this.cameras.main.worldView;
    return {
      view: { x: view.x, y: view.y, w: view.width, h: view.height },
      bodyArt:this.avatar.bodyArt,
      setPlayerVisible:visible=>this.avatar.setVisible(visible),
      restoreCamera:()=>{
        if(this.dead)return;
        this.applyZoom();
        this.cameras.main.startFollow(this.cameraTarget,false,.12,.12).setDeadzone(48,36);
      },
      classId: skill.classId,
      bounds: { x: 0, y: 0, w: this.world.width, h: this.world.height },
      points: this.scatter?.skillId === skill.id ? this.scatter.points : [],
      groundAt: (x, fromY) => this.world.groundBelow(x, fromY)?.y ?? null,
      rainTerrain: this.world.segments,
      playerAt:()=>({x:this.player.body.x,y:this.player.body.y-26}),
      targetsAt:(x,y,radius)=>[...this.monsters.values()].filter(m=>m.alive&&circleRect(x,y,radius,m.hitbox()))
        .map(m=>({...m.center(),id:String(m.spawn.uid)})).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)),
      frame: this.avatar.motionFrame,
      remainingMs: Math.max(0, skill.strikes.at(-1)!.atMs - atMs) + 250,
      reach: this.skillReach(skill),
      x: body.x,
      y: body.y,
      facing: body.facing,
      area: this.areaRect(area),
      targets: targets.map((m) => m.center()),
      origin: this.player.skillOrigin,
      from,
      tint: TIER_TINT[this.betTier] ?? 0xffffff,
      leadMs: 0,
    };
  }

  private onRoll(): void {
    this.fx.spawn('dust', this.player.body.x, this.player.body.y - 10);
    this.playSfx('roll');
  }

  private onLand(impact: number): void {
    if (impact > 300) this.fx.spawn('dust', this.player.body.x, this.player.body.y - 10);
    if (impact > 120) this.playSfx(impact > 520 ? 'landHeavy' : 'land');
  }

  /** 播放音效（sfxCues）：給多個名稱時播第一個有定義的；位置預設是角色。 */
  private playSfx(names: string | readonly string[], opts: SfxPlayOptions = {}): string | null {
    return sfx.playFirst(typeof names === 'string' ? [names] : names, { x: this.player?.body.x, ...opts });
  }

  private readonly sfxListener = () => {
    const view = this.cameras.main.worldView;
    return { x: view.centerX, halfWidth: view.width / 2 };
  };

  /** 撿到金幣：固定音高的一聲（不要音階）；武器、卷軸撿到不出聲（使用者覺得吵）。 */
  private collectSound(kind: 'coin' | 'item'): void {
    if (kind === 'coin') this.playSfx('coin');
  }

  private onStrike(skill: SkillDef, index: number): void {
    const strike = skill.strikes[index]!;
    const body = this.player.body;
    const dir = body.facing;
    const tint = TIER_TINT[this.betTier] ?? 0xffffff;
    const fxId = skill.slashFx ?? skill.fx;
    if(skill.classId==='warrior'&&skill.kind==='basic')this.skillFx.basicMelee(skill,this.fxContext(skill,strike.area,[],null,strike.atMs));
    else if (fxId) {
      const offset = skill.slashFx ? 22 : 30;
      this.fx.spawn(fxId, body.x + dir * offset, body.y - 26, { flipX: dir === 1, tint, additive: true, rainbow: this.betTier >= 5 });
    }
    const beat = { index, count: skill.strikes.length };
    if (skill.projectile) {
      this.playSfx([`launch:${skill.id}`, `launch:${skill.classId}`], beat);
      this.skillFx.release(skill,this.fxContext(skill,strike.area,[],null,strike.atMs));
      this.launchProjectile(skill, index, strike);
      return;
    }
    this.playSfx(`swing:${skill.id}`, beat);
    let targets: MonsterActor[];
    let from: FxPoint | null = null;
    if(skill.id==='skill_0050'){
      const ids=new Set(this.skillFx.phoenixTargetIds(index));
      targets=[...this.monsters.values()].filter(m=>m.alive&&ids.has(String(m.spawn.uid)));
    }
    else if (skill.chain) ({ targets, from } = this.chainTargets(skill, index, strike));
    else if (skill.scatter) targets = this.scatterTargets(skill, index, strike);
    else if(skill.id==='skill_0009'){
      const box=this.skillFx.tigerHitRect(index);
      targets=box?[...this.monsters.values()]
        .filter(m=>m.alive&&Math.abs(m.y-(this.skillFx.tigerFloorAt(m.x)??Infinity))<=60&&intersects(m.hitbox(),box))
        .sort((a,b)=>Math.abs(a.x-box.x-box.w/2)-Math.abs(b.x-box.x-box.w/2))
        .slice(0,strike.maxTargets):[];
    }
    else targets = this.findTargets(strike.area, strike.maxTargets, strike.pierce);
    // Rain is launched during wind-up. Its landing and applyHits share this exact step.
    const rainLanded = this.skillFx.landRain(skill, index);
    // 技能特效的聲音（雷擊、地裂、冰爆…）：沒打到怪也會響
    if (strike.fx) this.playSfx([`fx:${strike.fx}:${skill.classId}`, `fx:${strike.fx}`], { ...beat, x: targets[0]?.x ?? body.x });
    if (strike.fx && !rainLanded) this.skillFx.play(strike.fx, this.fxContext(skill, strike.area, targets, from, strike.atMs));
    this.applyHits(skill, index, targets);
  }

  /**
   * 連鎖（連鎖閃電、影襲）：第一刀照範圍找最近一隻，之後找離上一隻 range 內、這次還沒打過的最近一隻。
   * chain.blink：每一刀瞬移到目標背後。
   */
  private chainTargets(skill: SkillDef, index: number, strike: Strike): { targets: MonsterActor[]; from: FxPoint | null } {
    const chain = skill.chain!;
    if (index === 0 || this.chain?.skillId !== skill.id) this.chain = { skillId: skill.id, hit: new Set(), last: null };
    const state = this.chain;
    let target: MonsterActor | null = null;
    if (index === 0) {
      target = this.findTargets(strike.area, 1, false)[0] ?? null;
    } else if (state.last) {
      let best = Infinity;
      for (const m of this.monsters.values()) {
        if (!m.alive || state.hit.has(m.spawn.uid)) continue;
        const c = m.center();
        // 高低差乘上 verticalWeight（< 1 = 比較常跳到上下層）；正上方／正下方的扣分，瞬移是斜的
        const dx = Math.abs(c.x - state.last.x);
        const dy = Math.abs(c.y - state.last.y);
        const d = Math.hypot(dx, dy * (chain.verticalWeight ?? 1)) + (dy > 40 && dx < 60 ? 90 : 0);
        if (Math.hypot(dx, dy) <= chain.range * 1.4 && d <= chain.range && d < best) {
          best = d;
          target = m;
        }
      }
    }
    if (!target) return { targets: [], from: null };
    const body = this.player.body;
    let from: FxPoint | null = state.last ?? { x: body.x + body.facing * 14, y: body.y - 26 };
    if (chain.blink) {
      from = { x: body.x, y: body.y };
      const frame = this.avatar.motionFrame;
      if (frame) this.skillFx.afterimage(frame, body.x, body.y, body.facing, 0x8f5bd6, 0.5);
      this.teleportBehind(target);
    }
    state.hit.add(target.spawn.uid);
    state.last = target.center();
    return { targets: [target], from };
  }

  /** 技能往前打得到多遠（特效用：劍氣、流星箭、迴旋刃飛多遠）。 */
  private skillReach(skill: SkillDef): number {
    let reach = 0;
    for (const strike of skill.strikes) {
      const a = strike.area;
      if (a.shape === 'rect' || a.shape === 'line') reach = Math.max(reach, (a.offsetX ?? 0) + (a.w ?? 0));
      else if (a.shape === 'circle' || a.shape === 'sector') reach = Math.max(reach, a.r ?? 0);
      else if (a.shape === 'path') reach = Math.max(reach, a.w ?? 0);
      else if (a.shape === 'map') reach = Math.max(reach, this.world.width);
      else reach = Math.max(reach, this.cameras.main.worldView.width / 2);
    }
    return reach;
  }

  /**
   * 散射（分身飛鏢、影分身）：第一刀在畫面內挑點（優先怪物、彼此分開，不夠就補隨機地面點），
   * 之後每一刀打這些點附近的怪。
   */
  private scatterTargets(skill: SkillDef, index: number, strike: Strike): MonsterActor[] {
    const { count, radius } = skill.scatter!;
    if (index === 0 || this.scatter?.skillId !== skill.id) this.scatter = { skillId: skill.id, points: this.pickScatterPoints(count, radius, this.areaRect(strike.area)) };
    const points = this.scatter.points;
    const hits: { m: MonsterActor; d: number }[] = [];
    for (const m of this.monsters.values()) {
      if (!m.alive) continue;
      const c = m.center();
      const d = Math.min(...points.map((p) => Math.hypot(c.x - p.x, c.y - p.y)));
      if (d <= radius) hits.push({ m, d });
    }
    return hits
      .sort((a, b) => a.d - b.d)
      .slice(0, strike.maxTargets)
      .map((h) => h.m);
  }

  /** 在 area（畫面或整張地圖）裡挑散射點。 */
  private pickScatterPoints(count: number, radius: number, area: Rect): FxPoint[] {
    const view = new Phaser.Geom.Rectangle(area.x, area.y, area.w, area.h);
    const body = this.player.body;
    const inView = [...this.monsters.values()]
      .filter((m) => m.alive && Phaser.Geom.Rectangle.Contains(view, m.x, m.y - 10))
      .map((m) => ({ c: m.center(), d: Math.abs(m.x - body.x) + Math.abs(m.y - body.y) * 0.5 }))
      .sort((a, b) => a.d - b.d);
    const points: FxPoint[] = [];
    for (const { c } of inView) {
      if (points.length >= count) break;
      if (points.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= radius * 1.4)) points.push(c);
    }
    for (let tries = 0; points.length < count && tries < 40; tries += 1) {
      const x = view.x + 40 + Math.random() * (view.width - 80);
      const ground = this.world.groundBelow(x, view.y + Math.random() * view.height * 0.6);
      if (!ground || ground.y > view.bottom) continue;
      points.push({ x, y: ground.y - 24 });
    }
    return points;
  }

  /** 投射物：出手時瞄準扇形內的怪（SPEC §3.4），追蹤型飛行中持續轉向。 */
  private launchProjectile(skill: SkillDef, index: number, strike: Strike): void {
    const spec = skill.projectile!;
    const asset = this.bundle.fx.get(spec.fx);
    if (!asset) return;
    const body = this.player.body;
    const dir = body.facing;
    const x = body.x + dir * 14;
    const y = body.y - 26;
    const target = spec.aim ? this.aimTarget(x, y, dir, spec.aim.coneDeg, spec.aim.range) : null;
    let angle = dir === 1 ? 0 : Math.PI;
    if (target) {
      const c = target.center();
      angle = Math.atan2(c.y - y, c.x - x);
    }
    const classSprite=createClassProjectile(this,skill,x,y);
    const sprite=classSprite??this.add.sprite(x,y,asset.path,'0').setDepth(DEPTH.fx).setScale(spec.scale??1);
    if(!classSprite){sprite.setTint(spec.tint??TIER_TINT[this.betTier]??0xffffff);if(spec.tint!==undefined)sprite.setBlendMode(Phaser.BlendModes.ADD);}
    orientProjectile(sprite, angle);
    this.projectiles.push({
      sprite,
      lastX: body.x,
      lastY: y,
      x,
      y,
      angle,
      speed: spec.speed,
      remaining: (spec.aim?.range ?? strike.area.w ?? 300) + 60,
      skill,
      strike: index,
      target,
      turn: ((spec.aim?.turnDegPerSec ?? 0) * Math.PI) / 180,
    });
  }

  /** 面向 ±coneDeg、range 內的怪：角度偏差小的優先，再看距離。 */
  private aimTarget(x: number, y: number, dir: 1 | -1, coneDeg: number, range: number): MonsterActor | null {
    const cone = (coneDeg * Math.PI) / 180;
    let best: { m: MonsterActor; score: number } | null = null;
    for (const m of this.monsters.values()) {
      if (!m.alive) continue;
      const c = m.center();
      const dx = (c.x - x) * dir;
      const dy = c.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > range || dx < -4) continue;
      const off = Math.abs(Math.atan2(dy, Math.max(dx, 0.001)));
      if (off > cone) continue;
      const score = off * 180 + dist;
      if (!best || score < best.score) best = { m, score };
    }
    return best?.m ?? null;
  }

  private stepProjectiles(): void {
    const dt = PHYSICS.dt;
    this.projectiles = this.projectiles.filter((p) => {
      // 追蹤：朝目標轉，每步最多轉 turn × dt
      if (p.target && p.turn > 0) {
        if (p.target.alive) {
          const c = p.target.center();
          const want = Math.atan2(c.y - p.y, c.x - p.x);
          const diff = Phaser.Math.Angle.Wrap(want - p.angle);
          p.angle += Phaser.Math.Clamp(diff, -p.turn * dt, p.turn * dt);
          orientProjectile(p.sprite, p.angle);
        } else {
          p.target = null;
        }
      }
      const move = p.speed * dt;
      p.x += Math.cos(p.angle) * move;
      p.y += Math.sin(p.angle) * move;
      p.remaining -= move;
      // 掃過的線段上最靠近起點的那隻
      let hit: MonsterActor | undefined;
      let hitAt = Infinity;
      for (const m of this.monsters.values()) {
        if (!m.alive) continue;
        const t = segmentHitsRect(m.hitbox(), p.lastX, p.lastY, p.x, p.y, 4);
        if (t !== null && t < hitAt) {
          hit = m;
          hitAt = t;
        }
      }
      p.lastX = p.x;
      p.lastY = p.y;
      if (hit) {
        const box = hit.hitbox();
        const hx = Phaser.Math.Clamp(p.x, box.x, box.x + box.w);
        const hy = Phaser.Math.Clamp(p.y, box.y, box.y + box.h);
        const explode = p.skill.projectile?.explode;
        if (explode) {
          // 爆裂箭：半徑內的怪一起判定（仍是一刀一注）
          const strike = p.skill.strikes[p.strike]!;
          const near = [...this.monsters.values()]
            .filter((m) => m.alive)
            .map((m) => ({ m, d: Math.hypot(m.center().x - hx, m.center().y - hy) }))
            .filter(({ m, d }) => m === hit || d <= explode)
            .sort((a, b) => a.d - b.d)
            .slice(0, strike.maxTargets)
            .map(({ m }) => m);
          this.applyHits(p.skill, p.strike, near, p.angle);
          this.skillFx.phoenixBurst(hx,hy,1.4);
        } else {
          this.applyHits(p.skill, p.strike, [hit], p.angle);
        }
      }
      if (hit || p.remaining <= 0) {
        p.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /** 判定範圍的外框（世界座標）；特效也用這個。 */
  private areaRect(area: Area): Rect {
    const body = this.player.body;
    const dir = body.facing;
    const cy = body.y - 24;
    switch (area.shape) {
      case 'rect':
      case 'line': {
        const near = body.x + dir * (area.offsetX ?? 0);
        const far = near + dir * (area.w ?? 0);
        const h = area.h ?? 24;
        return { x: Math.min(near, far), y: cy - h / 2, w: Math.abs(far - near), h };
      }
      case 'path': {
        const origin = this.player.skillOrigin ?? { x: body.x, y: body.y };
        const end = body.x + dir * (area.w ?? 0);
        const h = area.h ?? 60;
        const top = Math.min(origin.y, body.y) - 24 - h / 2;
        const bottom = Math.max(origin.y, body.y) - 24 + h / 2;
        return { x: Math.min(origin.x, end), y: top, w: Math.abs(end - origin.x), h: bottom - top };
      }
      case 'circle':
      case 'sector': {
        const r = area.r ?? 0;
        return { x: body.x - r, y: cy - r, w: r * 2, h: r * 2 };
      }
      case 'screen': {
        const view = this.cameras.main.worldView;
        return { x: view.x, y: view.y, w: view.width, h: view.height };
      }
      case 'map':
        return { x: 0, y: 0, w: this.world.width, h: this.world.height };
    }
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
        case 'line':
        case 'path':
        case 'map':
          inside = intersects(box, this.areaRect(area));
          break;
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
  private applyHits(skill: SkillDef, index: number, targets: MonsterActor[], impactAngle?: number): void {
    if (targets.length === 0) return;
    const bet = this.bet;
    // 技能押注倍數（SPEC §3.1）：跟伺服器用同一個公式先預扣，結果回來再對帳
    const flat = this.mode === 'dev';
    const costMul = strikeCostMultiplier(skill, index, targets.map((m) => ({ uid: m.spawn.uid, multiplier: m.spawn.multiplier })), DEFAULT_RTP, { flat });
    const cost = Math.round(bet * costMul * 100) / 100;
    if (this.displayBalance < cost) {
      if (this.autoOn) this.setAuto(false, '餘額不足');
      else this.showToast('餘額不足，請降低押注');
      return;
    }
    const classDef = this.bundle.classes.get(this.classId)!;
    const [minDamage, maxDamage] = classDef.damage;
    const body = this.player.body;
    for (const m of targets) {
      m.onHit(skill.id==='skill_0009'?this.skillFx.tigerImpactX??body.x:body.x,impactFeel(skill,index).strength);
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
    }
    const feel=this.skillFx.contact(skill,index,{...this.fxContext(skill,skill.strikes[index]!.area,targets,null,skill.strikes[index]!.atMs),impactAngle});
    // 命中音：技能（或職業）的打擊聲，力道大、一次打很多隻再各疊一層
    if (targets.length > 0) {
      const hit = { index, count: skill.strikes.length, x: targets.reduce((sum, m) => sum + m.x, 0) / targets.length };
      const played = this.playSfx([`hit:${skill.id}`, `hit:${skill.classId}`], hit);
      // 命中聲定義成空的（月斷由演出自己出聲）就不再疊
      if (played && SFX_CUES[played]!.length > 0) {
        if (feel.strength >= 1.1) this.playSfx('hit:heavy', hit);
        if (targets.length >= 5) this.playSfx('hit:crowd', hit);
      }
    }
    this.hitStopMs = Math.max(this.hitStopMs, feel.stopMs);
    if (feel.pixels > 0) this.cameras.main.shake(feel.durationMs,new Phaser.Math.Vector2(feel.pixels/this.cameras.main.worldView.width,feel.pixels*.45/this.cameras.main.worldView.height));

    const seq = ++this.seq;
    const comboGeneration = this.comboTracker.generation;
    this.pendingCost += cost;
    this.server
      .attack({ seq, skillId: skill.id, strike: index, bet, targets: targets.map((m) => m.spawn.uid), flat })
      .then((result) => {
        if (!this.dead && !this.switching && comboGeneration === this.comboTracker.generation && !result.error) {
          this.comboTracker.hit(new Set(result.results.map(hit => hit.uid)).size);
        }
        this.onAttackResult(result, cost);
      })
      .catch(() => {
        this.pendingCost -= cost;
      });
  }

  /** reserved = 出手時預扣的金額（押注 × 技能押注倍數）。 */
  private onAttackResult(result: AttackResult, reserved: number): void {
    this.pendingCost -= reserved;
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
      this.playSfx('kill', { x: c.x });
      if (outcome.multiplier >= 10) this.playSfx('killRich', { x: c.x });
      monster.kill(() => {
        this.playSfx('coinsSpill', { x: c.x });
        this.pickups.coins(c.x, c.y, coins, floor);
        for (const item of outcome.loot ?? []) this.pickups.item(item, c.x, c.y, floor);
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
      this.playSfx(`win:${level}`, { x: undefined });
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
    const info = (id: string) => {
      const skill = this.bundle.skills.get(id);
      return {
        id,
        name: skill?.name ?? '',
        icon: skill?.icon ?? 'spark',
        cooldownMs: this.ready ? this.player.cooldown(id) : 0,
        totalMs: (skill?.cooldownSec ?? 0) * 1000,
        price: this.skillPrice(id),
      };
    };
    const hotbar: HudState['skills'] = (classDef?.skills ?? []).map((id, slot) => {
      return { ...info(id), slot, key: String(slot + 1), ultimate: this.bundle.skills.get(id)?.ultimate ?? false };
    });
    this.opts.onHud({
      combo: this.comboTracker.snapshot(),
      loading: !this.ready,
      inventory: this.inventoryState,
      inventoryOpen: this.inventoryOpen,
      balance: this.displayBalance,
      bet: this.bet,
      betLevels: this.betLevels(),
      betTier: this.betTier,
      roomId: this.roomId,
      roomName: this.roomName,
      rooms: this.bundle.rooms.map((r) => ({ id: r.id, name: r.name, betRange: r.betRange, lineup: r.lineup ?? [] })),
      classId: this.classId,
      classes: [...this.bundle.classes.values()].map((c) => ({ id: c.id, name: c.name })),
      mode: this.mode,
      skills: hotbar,
      ...(classDef?.secondary ? { secondary: info(classDef.secondary) } : {}),
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
      pickups: this.pickups.count,
      skillFx: this.skillFx.count,
      lights: this.lights.getLightCount(),
      x: Math.round(this.player?.body.x ?? 0),
      y: Math.round(this.player?.body.y ?? 0),
      ground: this.player?.body.ground ?? -1,
      climb: this.player?.body.climb ?? -1,
      room: this.roomId,
      balance: this.displayBalance,
      auto: this.autoOn ? 1 : 0,
      ...(this.autoOn ? this.auto.debugInfo() : {}),
      ...this.playerScreen(),
    };
  }

  /** 玩家腳底在畫面上的位置（CSS 像素；截圖腳本用來對準角色）。 */
  private playerScreen(): { screenX: number; screenY: number } {
    const body = this.player?.body;
    if (!body) return { screenX: 0, screenY: 0 };
    const screen = this.worldToScreen(body.x, body.y);
    return { screenX: Math.round(screen.x), screenY: Math.round(screen.y) };
  }

  /** 世界座標 → 畫面座標（CSS 像素）。 */
  private worldToScreen(x: number, y: number): { x: number; y: number } {
    const camera = this.cameras.main;
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (camera.x + (x - camera.worldView.x) * camera.zoom) / dpr,
      y: (camera.y + (y - camera.worldView.y) * camera.zoom) / dpr,
    };
  }

  private teardown(): void {
    this.dead = true;
    for (const off of this.unsubscribes) off();
    this.server?.dispose();
    this.keys?.dispose();
    this.bgm?.destroy();
    if (sfx.listener === this.sfxListener) sfx.listener = null;
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

/** 線段 (x1,y1)→(x2,y2) 碰到外擴 pad 的 rect 時，回傳碰到的位置 t（0–1）；沒碰到回傳 null（Liang–Barsky）。 */
function segmentHitsRect(rect: Rect, x1: number, y1: number, x2: number, y2: number, pad: number): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x1 - (rect.x - pad)],
    [dx, rect.x + rect.w + pad - x1],
    [-dy, y1 - (rect.y - pad)],
    [dy, rect.y + rect.h + pad - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return t0;
}

/** 投射物素材面向左：往右半邊飛時水平翻轉，避免上下顛倒。 */
function orientProjectile(sprite: Phaser.GameObjects.Sprite, angle: number): void {
  orientSkillWeapon(sprite,angle);
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

function loadMode(): GameMode {
  try {
    const params = new URLSearchParams(location.search).get('mode');
    if (params === 'dev' || params === 'real') return params;
    return localStorage.getItem(MODE_KEY) === 'dev' ? 'dev' : 'real';
  } catch {
    return 'real';
  }
}

function saveMode(mode: GameMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 無痕模式等情況無法存，忽略
  }
}
