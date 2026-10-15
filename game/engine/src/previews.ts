import * as Phaser from 'phaser';
import {
  ThemeFileVersioned,
  contentPaths,
  parseAsepriteSheet,
  resolveSheetImage,
  type AvatarLoadout,
  type AvatarTag,
  type MapDef,
  type MonsterDef,
} from '@lawn/shared';
import type { ContentSource } from './content';
import type { SheetAsset } from './content/bundle';
import { MapView } from './map/MapView';
import { SheetAnimator, frameName, loadSheetAssets } from './render/sheets';

/**
 * 編輯器用的預覽元件（不啟動 HUD 與 LocalServer，COLLAB §2.2）。
 * 每個預覽各自建立一個 Phaser.Game，畫布以裝置實際像素渲染。
 */

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

/**
 * 預覽場景的共同基底：handle 可能在場景建立前就被呼叫（React 的 useEffect 時序），
 * 這些呼叫先排隊，create() 之後依序套用；destroy 後所有非同步回呼都忽略。
 */
abstract class PreviewScene extends Phaser.Scene {
  ready = false;
  dead = false;
  private pending: (() => void)[] = [];

  whenReady(fn: () => void): void {
    if (this.dead) return;
    if (this.ready) fn();
    else this.pending.push(fn);
  }

  protected markReady(): void {
    this.ready = true;
    for (const fn of this.pending.splice(0)) fn();
  }
}

function createPreviewGame(parent: HTMLElement, scene: PreviewScene, smooth: boolean): { game: Phaser.Game; dispose: () => void } {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const size = () => ({ w: Math.max(1, Math.round(parent.clientWidth * dpr)), h: Math.max(1, Math.round(parent.clientHeight * dpr)) });
  const initial = size();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: initial.w,
    height: initial.h,
    backgroundColor: '#1d1b26',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: smooth ? { smoothPixelArt: true, maxLights: 16 } : { pixelArt: true, maxLights: 16 },
    input: { keyboard: false },
    scene,
  });
  const observer = new ResizeObserver(() => {
    const next = size();
    game.scale.resize(next.w, next.h);
  });
  observer.observe(parent);
  return {
    game,
    dispose: () => {
      scene.dead = true;
      observer.disconnect();
      game.destroy(true);
    },
  };
}

async function loadSheetAsset(source: ContentSource, path: string): Promise<SheetAsset> {
  const sheet = parseAsepriteSheet(await source.json(path));
  return { path, sheet, image: resolveSheetImage(path, sheet.image) };
}

// ---------------------------------------------------------------------------
// 怪物預覽
// ---------------------------------------------------------------------------

export interface MonsterPreviewOptions {
  content: ContentSource;
  monster: MonsterDef;
  showHitbox?: boolean;
  lighting?: boolean;
  /** 整數倍放大；不填時依畫布大小自動決定。 */
  zoom?: number;
  /** 放在地板上來回巡邏。 */
  patrol?: boolean;
  /** 倍率標籤上顯示的數字（預覽用）。 */
  multiplier?: number;
}
export interface MonsterPreviewHandle {
  play(action: 'move' | 'idle' | 'hit' | 'die' | 'appear'): void;
  /** 模擬「受擊（頓幀、閃白）→ 死亡 → 噴金幣」。 */
  simulateKill(): void;
  update(options: Partial<MonsterPreviewOptions>): void;
  destroy(): void;
}

class MonsterPreviewScene extends PreviewScene {
  opts!: MonsterPreviewOptions;
  private asset: SheetAsset | null = null;
  private coin: SheetAsset | null = null;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private animator: SheetAnimator | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private coins: { sprite: Phaser.GameObjects.Sprite; vx: number; vy: number; age: number; animator: SheetAnimator }[] = [];
  private queue: (() => void)[] = [];
  private loopAction: 'idle' | 'move' = 'idle';
  private x = 0;
  private facing: 1 | -1 = -1;
  private flashMs = 0;
  private freezeMs = 0;
  private fadeMs = -1;
  private coinFired = false;
  private loadToken = 0;
  /** 素材載入前收到的 play／simulateKill：只保留最後一次，載入後套用 */
  private afterLoad: (() => void) | null = null;

  constructor() {
    super('monster-preview');
  }

  create(): void {
    this.overlay = this.add.graphics().setDepth(10);
    this.label = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', stroke: '#1a1426', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(11).setResolution(4);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
    this.markReady();
    void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.ready || this.dead) return;
    const token = ++this.loadToken;
    const { content, monster } = this.opts;
    const asset = await loadSheetAsset(content, monster.sheet);
    const coin = await loadSheetAsset(content, contentPaths.fxSheet('coin')).catch(() => null);
    if (this.dead || token !== this.loadToken) return;
    // 圖片可能被編輯器重新匯出：用 key 加上載入序號避免拿到舊的 texture
    asset.path = `${asset.path}?v=${token}`;
    await loadSheetAssets(this, content, [asset, ...(coin ? [coin] : [])]);
    if (this.dead || token !== this.loadToken) return;
    this.asset = asset;
    this.coin = coin;
    this.sprite?.destroy();
    this.sprite = this.add.sprite(0, 0, asset.path, frameName(null, 0)).setOrigin(0.5, 1);
    this.animator = new SheetAnimator(asset.sheet, null, monster.frameDurations ?? {});
    this.loopAction = this.opts.patrol ? 'move' : 'idle';
    this.playTag(this.loopAction, true);
    this.layout();
    const queued = this.afterLoad;
    this.afterLoad = null;
    queued?.();
  }

  private layout(): void {
    if (!this.asset) return;
    const first = this.asset.sheet.frames[0];
    const canvasH = first?.sourceSize.h ?? 64;
    const zoom = this.opts.zoom ?? Math.max(1, Math.floor((this.scale.height * 0.55) / canvasH));
    const camera = this.cameras.main;
    camera.setZoom(zoom);
    camera.centerOn(0, -canvasH * 0.45);
  }

  private tagName(action: 'move' | 'idle' | 'hit' | 'die' | 'appear'): string | undefined {
    return this.opts.monster.tags[action];
  }

  private playTag(action: 'move' | 'idle' | 'hit' | 'die' | 'appear', loop: boolean, onComplete?: () => void): void {
    const tag = this.tagName(action);
    if (!tag || !this.animator) return onComplete?.();
    const ok = this.animator.play(tag, { loop, restart: true, ...(onComplete ? { onComplete } : {}) });
    if (!ok) onComplete?.();
  }

  play(action: 'move' | 'idle' | 'hit' | 'die' | 'appear'): void {
    if (!this.animator) {
      this.afterLoad = () => this.play(action);
      return;
    }
    this.resetVisual();
    if (action === 'idle' || action === 'move') {
      this.loopAction = action;
      this.playTag(action, true);
      return;
    }
    this.playTag(action, false, () => {
      if (action !== 'die') this.playTag(this.loopAction, true);
    });
  }

  simulateKill(): void {
    if (!this.animator) {
      this.afterLoad = () => this.simulateKill();
      return;
    }
    this.resetVisual();
    const hit = () => {
      this.flashMs = 50;
      this.freezeMs = 60;
      this.sprite?.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.cameras.main.shake(80, 0.004);
    };
    hit();
    this.playTag('hit', false, () => {
      hit();
      this.playTag('hit', false, () => {
        this.coinFired = false;
        this.playTag('die', false, () => {
          this.fadeMs = (this.opts.monster.behavior.dieFadeSec ?? 0.4) * 1000;
          this.queue.push(() => {
            this.time.delayedCall(700, () => {
              this.resetVisual();
              this.playTag(this.loopAction, true);
            });
          });
        });
      });
    });
  }

  private resetVisual(): void {
    this.fadeMs = -1;
    this.coinFired = true;
    this.sprite?.setAlpha(1).setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
  }

  private spawnCoins(): void {
    if (!this.coin) return;
    const def = this.opts.monster;
    for (let i = 0; i < Math.min(30, def.fx.coinCount); i += 1) {
      const animator = new SheetAnimator(this.coin.sheet);
      animator.play('play', { loop: true });
      const sprite = this.add.sprite(this.x, def.hitbox.y + def.hitbox.h / 2, this.coin.path, frameName(null, 0)).setDepth(12);
      this.coins.push({ sprite, animator, vx: (Math.random() - 0.5) * 120, vy: -160 - Math.random() * 80, age: 0 });
    }
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    for (const fn of this.queue.splice(0)) fn();
    const animDt = this.freezeMs > 0 ? 0 : dt;
    this.freezeMs = Math.max(0, this.freezeMs - dt);
    if (!this.sprite || !this.animator || !this.asset) return;
    const def = this.opts.monster;

    this.animator.update(animDt);
    this.sprite.setFrame(frameName(null, this.animator.frame));
    if (this.flashMs > 0) {
      this.flashMs -= dt;
      if (this.flashMs <= 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    }
    const dieTag = this.asset.sheet.tags.get(def.tags.die);
    if (!this.coinFired && this.animator.tag === def.tags.die && dieTag && this.animator.index >= Math.min(def.fx.coinFrame, dieTag.to - dieTag.from)) {
      this.coinFired = true;
      this.spawnCoins();
    }
    if (this.fadeMs >= 0) {
      this.fadeMs -= dt;
      this.sprite.setAlpha(Math.max(0, this.fadeMs / Math.max(1, (def.behavior.dieFadeSec ?? 0.4) * 1000)));
    }

    // 巡邏：在 ±80 像素內來回
    if (this.opts.patrol && this.animator.tag === def.tags.move) {
      this.x += (def.behavior.speed * this.facing * animDt) / 1000;
      if (Math.abs(this.x) > 80) {
        this.facing = this.x > 0 ? -1 : 1;
        this.x = Phaser.Math.Clamp(this.x, -80, 80);
      }
    } else if (!this.opts.patrol) {
      this.x = 0;
    }
    this.sprite.setPosition(Math.round(this.x), 0).setFlipX(this.facing === 1);

    for (const coin of this.coins) {
      coin.age += animDt;
      coin.vy += (700 * animDt) / 1000;
      coin.sprite.x += (coin.vx * animDt) / 1000;
      coin.sprite.y = Math.min(-6, coin.sprite.y + (coin.vy * animDt) / 1000);
      if (coin.sprite.y >= -6 && coin.vy > 0) coin.vy = -coin.vy * 0.35;
      coin.animator.update(animDt);
      coin.sprite.setFrame(frameName(null, coin.animator.frame));
      coin.sprite.setAlpha(coin.age > 900 ? Math.max(0, 1 - (coin.age - 900) / 300) : 1);
    }
    this.coins = this.coins.filter((coin) => {
      if (coin.age < 1200) return true;
      coin.sprite.destroy();
      return false;
    });

    // 地板、判定框、標籤位置
    const g = this.overlay;
    g.clear();
    g.lineStyle(1, 0x6a6488, 1).lineBetween(-200, 0, 200, 0);
    const flip = this.facing === 1;
    const hb = def.hitbox;
    const hx = this.x + (flip ? -(hb.x + hb.w) : hb.x);
    if (this.opts.showHitbox ?? true) {
      g.lineStyle(1, 0xff4d4d, 1).strokeRect(Math.round(hx), hb.y, hb.w, hb.h);
    }
    const lx = this.x + (flip ? -def.labelOffset.x : def.labelOffset.x);
    g.fillStyle(0xffe066, 1).fillRect(Math.round(lx) - 1, def.labelOffset.y - 1, 3, 3);
    this.label.setText(`×${this.opts.multiplier ?? 5}`).setPosition(Math.round(lx), def.labelOffset.y - 3);
    this.label.setVisible(this.sprite.alpha > 0.5);
  }
}

export function createMonsterPreview(parent: HTMLElement, options: MonsterPreviewOptions): MonsterPreviewHandle {
  const scene = new MonsterPreviewScene();
  scene.opts = { ...options };
  const { dispose } = createPreviewGame(parent, scene, false);
  return {
    play: (action) => scene.play(action),
    simulateKill: () => scene.simulateKill(),
    update(patch) {
      const sheetChanged = patch.monster && patch.monster.sheet !== scene.opts.monster.sheet;
      const durationsChanged = patch.monster && JSON.stringify(patch.monster.frameDurations) !== JSON.stringify(scene.opts.monster.frameDurations);
      scene.opts = { ...scene.opts, ...patch };
      if (sheetChanged || durationsChanged || patch.content) void scene.reload();
    },
    destroy: dispose,
  };
}

// ---------------------------------------------------------------------------
// 地圖預覽
// ---------------------------------------------------------------------------

export interface MapPreviewOptions {
  content: ContentSource;
  map: MapDef;
  lighting?: boolean;
  quality?: 'high' | 'low';
  showFootholds?: boolean;
  showNav?: boolean;
}
export interface MapPreviewHandle {
  /** 移動假鏡頭（地圖座標，鏡頭中心）。zoom 不填時用內部 540 高的縮放。 */
  setCamera(x: number, y: number, zoom?: number): void;
  update(options: Partial<MapPreviewOptions>): void;
  destroy(): void;
}

class MapPreviewScene extends PreviewScene {
  opts!: MapPreviewOptions;
  private view: MapView | null = null;
  private center: { x: number; y: number } | null = null;
  private zoom: number | null = null;
  private building = 0;

  constructor() {
    super('map-preview');
  }

  create(): void {
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyCamera());
    this.markReady();
    void this.rebuild();
  }

  async rebuild(): Promise<void> {
    if (!this.ready || this.dead) return;
    const token = ++this.building;
    const { content, map } = this.opts;
    const themes = await content
      .json(contentPaths.themes)
      .then((raw) => ThemeFileVersioned.migrate(raw))
      .catch(() => null);
    if (this.dead || token !== this.building) return;
    const theme = themes?.themes.find((t) => t.id === map.theme);
    await MapView.preload(this, content, map, theme);
    if (this.dead || token !== this.building) return;
    this.view?.destroy();
    this.lights.lights.slice().forEach((light) => this.lights.removeLight(light));
    const lighting = (this.opts.lighting ?? true) && this.opts.quality !== 'low';
    this.view = new MapView(this, map, theme);
    this.view.build({ lighting });
    if (!lighting) this.lights.disable();
    this.view.setDebug(this.opts.showFootholds ?? false, { nav: this.opts.showNav ?? false });
    this.applyCamera();
  }

  /** 場景建立前呼叫也可以：只記下位置，建立後套用。 */
  setCamera(x: number, y: number, zoom?: number): void {
    this.center = { x, y };
    this.zoom = zoom ?? null;
    this.applyCamera();
  }

  private applyCamera(): void {
    if (!this.ready || this.dead) return;
    const camera = this.cameras.main;
    const map = this.opts.map;
    this.center ??= { x: map.size.w / 2, y: map.size.h / 2 };
    camera.setBounds(map.cameraBounds.x, map.cameraBounds.y, map.cameraBounds.w, map.cameraBounds.h);
    camera.setZoom(this.zoom ?? this.scale.height / 540);
    camera.centerOn(this.center.x, this.center.y);
  }

  refreshDebug(): void {
    if (!this.ready || this.dead) return;
    this.view?.setDebug(this.opts.showFootholds ?? false, { nav: this.opts.showNav ?? false });
  }

  override update(_time: number, delta: number): void {
    this.view?.update(Math.min(delta, 100), this.cameras.main);
  }
}

export function createMapPreview(parent: HTMLElement, options: MapPreviewOptions): MapPreviewHandle {
  const scene = new MapPreviewScene();
  scene.opts = { ...options };
  const { dispose } = createPreviewGame(parent, scene, true);
  return {
    setCamera: (x, y, zoom) => scene.setCamera(x, y, zoom),
    update(patch) {
      const needsRebuild =
        (patch.map && patch.map !== scene.opts.map) ||
        (patch.lighting !== undefined && patch.lighting !== scene.opts.lighting) ||
        (patch.quality !== undefined && patch.quality !== scene.opts.quality) ||
        patch.content !== undefined;
      scene.opts = { ...scene.opts, ...patch };
      // 場景建立前只更新設定；create() 會用最新的設定建立
      if (needsRebuild) void scene.rebuild();
      else scene.refreshDebug();
    },
    destroy: dispose,
  };
}

// ---------------------------------------------------------------------------
// 紙娃娃預覽（M5 前完成）
// ---------------------------------------------------------------------------

export interface AvatarPreviewOptions {
  content: ContentSource;
  loadout: AvatarLoadout;
  classId?: 'warrior' | 'mage' | 'archer' | 'assassin';
  tag: AvatarTag;
  /** 指定幀；未指定時循環播放。 */
  frame?: number;
  onionSkin?: boolean;
  lighting?: boolean;
  /** 整數倍放大，預設 4。 */
  zoom?: number;
}
export interface AvatarPreviewHandle {
  update(options: Partial<AvatarPreviewOptions>): void;
  destroy(): void;
}

export function createAvatarPreview(parent: HTMLElement, _options: AvatarPreviewOptions): AvatarPreviewHandle {
  class PlaceholderScene extends PreviewScene {
    create(): void {
      this.markReady();
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '紙娃娃預覽\n（M5 前完成）', { fontFamily: 'monospace', fontSize: '14px', color: '#9a96b0', align: 'center' })
        .setOrigin(0.5);
    }
  }
  const { dispose } = createPreviewGame(parent, new PlaceholderScene(), false);
  return { update() {}, destroy: dispose };
}
