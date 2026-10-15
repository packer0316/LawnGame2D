import * as Phaser from 'phaser';
import type { ContentBundle } from '../content/bundle';
import { DEPTH } from '../map/MapView';
import { SheetAnimator, frameName } from '../render/sheets';

/** 押注等級外觀的刀光顏色（SPEC §3.2）。 */
export const TIER_TINT: Record<number, number> = { 1: 0xffffff, 2: 0x8fd0ff, 3: 0xc79bff, 4: 0xffd166, 5: 0xff7ad9 };

interface FxItem {
  sprite: Phaser.GameObjects.Sprite;
  animator: SheetAnimator;
  vx: number;
  vy: number;
  rainbow: boolean;
}

interface NumberItem {
  text: Phaser.GameObjects.Text;
  ageMs: number;
  baseY: number;
}

interface CoinItem {
  sprite: Phaser.GameObjects.Sprite;
  animator: SheetAnimator;
  vx: number;
  vy: number;
  floorY: number;
  ageMs: number;
  flyFrom: { x: number; y: number } | null;
  flyMs: number;
}

/** 特效、傷害數字、金幣（SPEC §4.6）。頓幀時 frozen = true，全部停住。 */
export class FxLayer {
  private fx: FxItem[] = [];
  private numbers: NumberItem[] = [];
  private coinItems: CoinItem[] = [];
  private elapsed = 0;
  /** 金幣飛去的目標（世界座標，通常是畫面右上角） */
  coinTarget: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  onCoinCollected: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
  ) {}

  spawn(
    id: string,
    x: number,
    y: number,
    options: { flipX?: boolean; tint?: number; additive?: boolean; scale?: number; vx?: number; vy?: number; depth?: number; rainbow?: boolean; rotation?: number } = {},
  ): Phaser.GameObjects.Sprite | null {
    const asset = this.bundle.fx.get(id);
    if (!asset) return null;
    const animator = new SheetAnimator(asset.sheet);
    animator.play('play', { loop: false });
    const sprite = this.scene.add
      .sprite(x, y, asset.path, frameName(null, animator.frame))
      .setDepth(options.depth ?? DEPTH.fx)
      .setFlipX(options.flipX ?? false)
      .setScale(options.scale ?? 1)
      .setRotation(options.rotation ?? 0);
    if (options.additive) sprite.setBlendMode(Phaser.BlendModes.ADD);
    if (options.tint !== undefined) sprite.setTint(options.tint);
    this.fx.push({ sprite, animator, vx: options.vx ?? 0, vy: options.vy ?? 0, rainbow: options.rainbow ?? false });
    return sprite;
  }

  /** 楓之谷式往上疊的傷害數字；stack 是同一隻怪的第幾段。 */
  damage(x: number, y: number, value: number, options: { crit?: boolean; stack?: number } = {}): void {
    const crit = options.crit ?? false;
    const text = this.scene.add
      .text(Math.round(x), Math.round(y - (options.stack ?? 0) * 12), String(value), {
        fontFamily: 'monospace',
        fontSize: crit ? '16px' : '13px',
        fontStyle: 'bold',
        color: crit ? '#ff5d5d' : '#ffb13d',
        stroke: '#2a1408',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.numbers)
      .setResolution(3)
      .setScale(1.5);
    this.numbers.push({ text, ageMs: 0, baseY: text.y });
  }

  /** 金幣噴出 → 落地彈跳 → 飛向餘額。 */
  coins(x: number, y: number, count: number, floorY: number): void {
    const asset = this.bundle.fx.get('coin');
    if (!asset) return;
    for (let i = 0; i < count; i += 1) {
      const animator = new SheetAnimator(asset.sheet);
      animator.play('play', { loop: true });
      animator.seek(i % 6);
      const sprite = this.scene.add.sprite(x, y, asset.path, frameName(null, animator.frame)).setDepth(DEPTH.fx + 1);
      this.coinItems.push({
        sprite,
        animator,
        vx: (Math.random() - 0.5) * 140,
        vy: -170 - Math.random() * 90,
        floorY,
        ageMs: -i * 25,
        flyFrom: null,
        flyMs: 0,
      });
    }
  }

  get count(): number {
    return this.fx.length + this.numbers.length + this.coinItems.length;
  }

  update(dtMs: number, frozen: boolean): void {
    this.elapsed += dtMs;
    const dt = frozen ? 0 : dtMs;

    this.fx = this.fx.filter((item) => {
      item.animator.update(dt);
      item.sprite.setFrame(frameName(null, item.animator.frame));
      item.sprite.x += (item.vx * dt) / 1000;
      item.sprite.y += (item.vy * dt) / 1000;
      if (item.rainbow) item.sprite.setTint(Phaser.Display.Color.HSVToRGB(((this.elapsed / 600) % 1 + 1) % 1, 0.5, 1).color);
      if (item.animator.finished) {
        item.sprite.destroy();
        return false;
      }
      return true;
    });

    this.numbers = this.numbers.filter((item) => {
      item.ageMs += dt;
      const t = item.ageMs;
      item.text.setScale(t < 90 ? 1.5 - (t / 90) * 0.5 : 1);
      item.text.y = item.baseY - Math.min(1, t / 500) * 18;
      item.text.setAlpha(t < 550 ? 1 : Math.max(0, 1 - (t - 550) / 200));
      if (t > 750) {
        item.text.destroy();
        return false;
      }
      return true;
    });

    const target = this.coinTarget();
    this.coinItems = this.coinItems.filter((coin) => {
      coin.ageMs += dt;
      coin.animator.update(dt);
      coin.sprite.setFrame(frameName(null, coin.animator.frame));
      if (coin.ageMs < 0) {
        coin.sprite.setVisible(false);
        return true;
      }
      coin.sprite.setVisible(true);
      if (coin.flyFrom) {
        coin.flyMs += dt;
        const k = Math.min(1, coin.flyMs / 380);
        const ease = k * k * (3 - 2 * k);
        coin.sprite.setPosition(coin.flyFrom.x + (target.x - coin.flyFrom.x) * ease, coin.flyFrom.y + (target.y - coin.flyFrom.y) * ease - Math.sin(k * Math.PI) * 30);
        if (k >= 1) {
          coin.sprite.destroy();
          this.onCoinCollected?.();
          return false;
        }
        return true;
      }
      const s = dt / 1000;
      coin.vy += 700 * s;
      coin.sprite.x += coin.vx * s;
      coin.sprite.y += coin.vy * s;
      if (coin.sprite.y > coin.floorY - 6 && coin.vy > 0) {
        coin.sprite.y = coin.floorY - 6;
        coin.vy = -coin.vy * 0.35;
        coin.vx *= 0.6;
      }
      if (coin.ageMs > 520) coin.flyFrom = { x: coin.sprite.x, y: coin.sprite.y };
      return true;
    });
  }

  destroy(): void {
    for (const item of this.fx) item.sprite.destroy();
    for (const item of this.numbers) item.text.destroy();
    for (const coin of this.coinItems) coin.sprite.destroy();
    this.fx = [];
    this.numbers = [];
    this.coinItems = [];
  }
}
