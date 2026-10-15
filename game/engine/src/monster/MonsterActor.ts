import * as Phaser from 'phaser';
import { PHYSICS, createBody, seededRandom, stepBody, NO_INPUT, type BodyState, type FootholdWorld, type MonsterDef, type MonsterMath, type Rect } from '@lawn/shared';
import type { SheetAsset } from '../content/bundle';
import { DEPTH } from '../map/MapView';
import { SheetAnimator, frameName } from '../render/sheets';
import type { MonsterSpawn } from '../server/types';

type MonsterState = 'idle' | 'move' | 'hit' | 'die' | 'gone';

const DEFAULT_DIE_FADE_SEC = 0.4;
const HIT_LOCK_MS = 160;

/**
 * 一隻怪物：確定性 AI（亂數種子 + 生成時間）、四個必備動作、受擊閃白與擊退、死亡淡出（SPEC §3.8）。
 * 美術面向左；facing = 1（右）時水平翻轉。
 */
export class MonsterActor {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse | null = null;
  private hpBar: Phaser.GameObjects.Graphics | null = null;
  private readonly animator: SheetAnimator;
  private readonly random: () => number;
  private body: BodyState | null = null;
  private fly: { baseY: number; phase: number } | null = null;
  state: MonsterState = 'idle';
  facing: 1 | -1;
  x: number;
  y: number;
  private modeMs = 0;
  private hitMs = 0;
  private flashMs = 0;
  private knockDir: 1 | -1 = 1;
  private fadeMs = -1;
  private dieFadeMs: number;
  private coinFired = false;
  private onCoin: (() => void) | null = null;
  /** 演出用血條（菁英、Boss） */
  hpShown = 1;
  /** 送出、還沒收到結果的攻擊數 */
  pending = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly world: FootholdWorld,
    readonly def: MonsterDef,
    readonly math: MonsterMath | undefined,
    private readonly sheet: SheetAsset,
    readonly spawn: MonsterSpawn,
    private readonly zone: Rect,
    lit: boolean,
  ) {
    this.random = seededRandom(spawn.seed);
    this.facing = this.random() < 0.5 ? -1 : 1;
    this.x = spawn.x;
    this.y = spawn.y;
    this.dieFadeMs = (def.behavior.dieFadeSec ?? DEFAULT_DIE_FADE_SEC) * 1000;
    this.animator = new SheetAnimator(sheet.sheet, null, def.frameDurations ?? {});
    this.sprite = scene.add.sprite(spawn.x, spawn.y, sheet.path, frameName(null, 0)).setOrigin(0.5, 1).setDepth(DEPTH.monsters);
    this.sprite.setLighting(lit);
    if (def.behavior.move !== 'fly') {
      this.shadow = scene.add.ellipse(spawn.x, spawn.y - 1, Math.max(12, def.hitbox.w * 0.85), 4, 0x092d29, 0.28).setDepth(DEPTH.monsters - 1);
    }
    this.label = scene.add
      .text(0, 0, `×${spawn.multiplier}`, { fontFamily: 'Segoe UI, sans-serif', fontSize: '9px', fontStyle: 'bold', color: tierColor(math?.tier), stroke: '#112e2b', strokeThickness: 2, backgroundColor: '#16322bd9', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.numbers - 1)
      .setResolution(3);
    if (def.showHpBar) this.hpBar = scene.add.graphics().setDepth(DEPTH.numbers - 1);

    if (def.behavior.move === 'fly') {
      this.fly = { baseY: spawn.y, phase: this.random() * Math.PI * 2 };
    } else {
      this.body = createBody(world, spawn.x, spawn.y - 2, this.facing);
    }
    this.enterMode(this.random() < 0.5 ? 'idle' : 'move');
    // 出生淡入
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300 });
  }

  get alive(): boolean {
    return this.state !== 'die' && this.state !== 'gone';
  }

  /** 判定框（世界座標）。 */
  hitbox(): Rect {
    const hb = this.def.hitbox;
    const x = this.facing === 1 ? -(hb.x + hb.w) : hb.x;
    return { x: this.x + x, y: this.y + hb.y, w: hb.w, h: hb.h };
  }

  center(): { x: number; y: number } {
    const box = this.hitbox();
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  private enterMode(mode: 'idle' | 'move'): void {
    this.state = mode;
    const [min, max] = mode === 'idle' ? this.def.behavior.idleSec : this.def.behavior.moveSec;
    this.modeMs = (min + (max - min) * this.random()) * 1000;
    if (mode === 'move' && this.random() < 0.4) this.facing = this.facing === 1 ? -1 : 1;
    this.animator.play(mode === 'idle' ? this.def.tags.idle : this.def.tags.move, { restart: true });
  }

  /** 固定步長：移動與狀態計時。 */
  step(): void {
    const dt = PHYSICS.dt * 1000;
    if (this.state === 'gone') return;
    if (this.state === 'die') {
      if (this.body) stepBody(this.world, this.body, NO_INPUT, { rooted: true, canClimb: false });
      this.syncBody();
      return;
    }
    if (this.hitMs > 0) {
      this.hitMs -= dt;
      const push = this.def.behavior.knockback * 14 * this.knockDir * (this.hitMs / HIT_LOCK_MS);
      if (this.body) stepBody(this.world, this.body, NO_INPUT, { forcedVx: push, canClimb: false });
      else this.x += (push * dt) / 1000;
      this.syncBody();
      if (this.hitMs <= 0) this.enterMode('idle');
      return;
    }
    this.modeMs -= dt;
    if (this.modeMs <= 0) this.enterMode(this.state === 'idle' ? 'move' : 'idle');
    const speed = this.state === 'move' && this.def.behavior.move !== 'static' ? this.def.behavior.speed : 0;

    if (this.body) {
      if (speed > 0 && this.shouldTurn()) this.facing = this.facing === 1 ? -1 : 1;
      stepBody(this.world, this.body, NO_INPUT, { forcedVx: speed * this.facing, canClimb: false });
      if (speed > 0 && this.body.vx === 0) this.facing = this.facing === 1 ? -1 : 1;
      this.syncBody();
    } else if (this.fly) {
      this.x += (speed * this.facing * dt) / 1000;
      if (this.x < this.zone.x || this.x > this.zone.x + this.zone.w) {
        this.facing = this.x < this.zone.x ? 1 : -1;
        this.x = Phaser.Math.Clamp(this.x, this.zone.x, this.zone.x + this.zone.w);
      }
      this.fly.phase += dt / 400;
      this.y = this.fly.baseY + Math.sin(this.fly.phase) * 8;
    }
  }

  /** 前方沒有地面、或走出生怪區就轉身（不會走下平台）。 */
  private shouldTurn(): boolean {
    const body = this.body!;
    const probe = body.x + this.facing * (PHYSICS.halfWidth + 4);
    if (probe < this.zone.x || probe > this.zone.x + this.zone.w) return true;
    if (body.ground === null) return false;
    const ahead = this.world.groundBelow(probe, body.y - PHYSICS.stepTolerance);
    return !ahead || Math.abs(ahead.y - body.y) > PHYSICS.stepTolerance;
  }

  private syncBody(): void {
    if (!this.body) return;
    this.x = this.body.x;
    this.y = this.body.y;
  }

  /** 每個畫面：動畫、位置、閃白、標籤。頓幀時 dtMs = 0。 */
  tick(dtMs: number): void {
    if (this.state === 'gone') return;
    this.animator.update(dtMs);
    this.sprite.setFrame(frameName(null, this.animator.frame));
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.shadow?.setPosition(Math.round(this.x), Math.round(this.y) - 1).setVisible(this.alive);
    this.sprite.setFlipX(this.facing === 1);

    if (this.flashMs > 0) {
      this.flashMs -= dtMs;
      if (this.flashMs <= 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    }
    if (this.state === 'die') {
      const dieTag = this.sheet.sheet.tags.get(this.def.tags.die);
      if (!this.coinFired && dieTag && this.animator.index >= Math.min(this.def.fx.coinFrame, dieTag.to - dieTag.from)) {
        this.coinFired = true;
        this.onCoin?.();
      }
      if (this.animator.finished) {
        if (this.fadeMs < 0) this.fadeMs = this.dieFadeMs;
        this.fadeMs -= dtMs;
        this.sprite.setAlpha(Math.max(0, this.fadeMs / Math.max(1, this.dieFadeMs)));
        if (this.fadeMs <= 0) this.state = 'gone';
      }
    }

    const lo = this.def.labelOffset;
    const labelX = this.x + (this.facing === 1 ? -lo.x : lo.x);
    this.label.setPosition(Math.round(labelX), Math.round(this.y + lo.y - 2));
    this.label.setVisible(this.alive);
    if (this.hpBar) {
      this.hpBar.clear();
      if (this.alive) {
        const w = 28;
        const bx = Math.round(labelX - w / 2);
        const by = Math.round(this.y + lo.y - 16);
        this.hpBar.fillStyle(0x1a1426, 1).fillRect(bx - 1, by - 1, w + 2, 5);
        this.hpBar.fillStyle(0xe2463f, 1).fillRect(bx, by, Math.max(1, Math.round(w * this.hpShown)), 3);
      }
    }
  }

  /** 被砍中（還不知道有沒有死）：閃白、擊退、受擊動作、血條遞減。 */
  onHit(fromX: number): void {
    if (!this.alive) return;
    this.flashMs = 50;
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.knockDir = this.x >= fromX ? 1 : -1;
    this.facing = this.knockDir === 1 ? -1 : 1;
    this.hpShown = Math.max(0.1, this.hpShown - 0.08);
    if (this.def.behavior.knockback > 0 || this.def.behavior.move !== 'static') {
      this.state = 'hit';
      this.hitMs = HIT_LOCK_MS;
      this.animator.play(this.def.tags.hit, { restart: true, loop: false });
    }
  }

  /** 伺服器判定擊殺：播放死亡，第 coinFrame 幀時呼叫 onCoin。 */
  kill(onCoin: () => void): void {
    if (!this.alive) return;
    this.state = 'die';
    this.hpShown = 0;
    this.onCoin = onCoin;
    this.animator.play(this.def.tags.die, { restart: true, loop: false });
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow?.destroy();
    this.label.destroy();
    this.hpBar?.destroy();
    this.state = 'gone';
  }
}

function tierColor(tier: MonsterMath['tier'] | undefined): string {
  switch (tier) {
    case 'elite':
      return '#ffd34d';
    case 'special':
      return '#ff8a3d';
    case 'boss':
      return '#ff5a8a';
    default:
      return '#e5ecd5';
  }
}
