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


/** 特效與傷害數字（SPEC §4.6；金幣、武器、卷軸的掉落在 Pickups）。頓幀時 frozen = true，全部停住。 */
export class FxLayer {
  private fx: FxItem[] = [];
  private numbers: NumberItem[] = [];
  private elapsed = 0;

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


  get count(): number {
    return this.fx.length + this.numbers.length;
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
  }

  destroy(): void {
    for (const item of this.fx) item.sprite.destroy();
    for (const item of this.numbers) item.text.destroy();
    this.fx = [];
    this.numbers = [];
  }
}
