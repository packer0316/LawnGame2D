import * as Phaser from 'phaser';
import {
  AVATAR_CANVAS,
  AVATAR_LAYERS,
  composeAvatarFrame,
  itemPaletteId,
  loadoutMapping,
  resolveLoadout,
  type AvatarLayer,
  type AvatarLoadout,
  type AvatarPart,
  type Expression,
  type ResolvedLoadout,
} from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { recolorTexture } from '../render/recolor';
import { SheetAnimator, frameName } from '../render/sheets';

export type { Expression };

/**
 * 紙娃娃：依圖層順序疊 Sprite。每幀擺放由 @lawn/shared 的 composeAvatarFrame 計算
 * （編輯器的工具畫面用同一套），這裡只負責對到 Sprite（SPEC §4.3、STUDIO_SPEC §4）。
 * 原點在腳底；美術面向左，facing = 1（右）時水平翻轉。
 */
export class AvatarView extends Phaser.GameObjects.Container {
  readonly animator: SheetAnimator;
  private readonly sprites = new Map<AvatarLayer, Phaser.GameObjects.Sprite>();
  private resolved: ResolvedLoadout = resolveLoadout([]);
  /** 'base' 或 itemId → 換色後的 texture key */
  private textureKeys = new Map<string, string>();
  private expression: Expression = 'default';
  private expressionMs = 0;
  private blinkInMs = 3000;
  private lastFrame = -1;
  private dirty = true;

  constructor(
    scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
  ) {
    super(scene);
    scene.add.existing(this);
    this.animator = new SheetAnimator(bundle.base.sheet, 'body');
    for (const layer of AVATAR_LAYERS) {
      const sprite = scene.add.sprite(0, 0, '__MISSING').setOrigin(0, 0).setVisible(false);
      this.sprites.set(layer, sprite);
      this.add(sprite);
    }
    this.animator.play('stand');
  }

  get frame(): number {
    return this.animator.frame;
  }

  setFacing(facing: 1 | -1): this {
    this.scaleX = facing === 1 ? -1 : 1;
    return this;
  }

  /** 套用外觀組合：依部件與顏色建立（必要時換色的）texture。 */
  setLoadout(loadout: AvatarLoadout): this {
    const { palettes, base } = this.bundle;
    const parts: AvatarPart[] = [];
    const keys = new Map<string, string>();
    keys.set('base', recolorTexture(this.scene, base.path, `${base.path}#${loadout.skin}`, loadoutMapping(palettes, loadout, null), base.sheet));
    for (const id of loadout.items) {
      const entry = this.bundle.items.get(id);
      if (!entry) continue;
      parts.push({ item: entry.item, sheet: entry.sheet.sheet });
      const mapping = loadoutMapping(palettes, loadout, entry.item);
      keys.set(id, recolorTexture(this.scene, entry.sheet.path, `${entry.sheet.path}#${loadout.skin}#${itemPaletteId(entry.item, loadout) ?? ''}`, mapping, entry.sheet.sheet));
    }
    this.resolved = resolveLoadout(parts);
    this.textureKeys = keys;
    this.dirty = true;
    this.refresh();
    return this;
  }

  play(tag: string, options: { loop?: boolean; restart?: boolean; onComplete?: () => void } = {}): this {
    if (this.animator.play(tag, options)) this.dirty = true;
    return this;
  }

  setExpression(expression: Expression, durationMs = 0): this {
    this.expression = expression;
    this.expressionMs = durationMs;
    this.dirty = true;
    return this;
  }

  /** 推進動畫與眨眼；頓幀時傳 0。 */
  tick(dtMs: number): void {
    this.animator.update(dtMs);
    if (this.expressionMs > 0) {
      this.expressionMs -= dtMs;
      if (this.expressionMs <= 0) this.setExpression('default');
    } else if (this.expression === 'default') {
      this.blinkInMs -= dtMs;
      if (this.blinkInMs <= 0) {
        this.blinkInMs = 3000 + Math.random() * 3000;
        this.setExpression('blink', 120);
      }
    }
    this.refresh();
  }

  /** 依目前幀擺好每個圖層。 */
  refresh(): void {
    const f = this.animator.frame;
    if (!this.dirty && f === this.lastFrame) return;
    this.lastFrame = f;
    this.dirty = false;
    const ops = composeAvatarFrame(this.bundle.base.sheet, this.resolved, f, { expression: this.expression });
    const byLayer = new Map(ops.map((op) => [op.layer, op]));
    for (const layer of AVATAR_LAYERS) {
      const sprite = this.sprites.get(layer)!;
      const op = byLayer.get(layer);
      const key = op ? this.textureKeys.get(op.source) : undefined;
      if (!op || !key) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setTexture(key, frameName(op.frameLayer, op.frameIndex));
      sprite.setPosition(-AVATAR_CANVAS.footX + op.dx, -AVATAR_CANVAS.footY + op.dy);
      sprite.setVisible(true);
    }
  }

  /** 受擊閃白等效果：套到所有圖層。 */
  setFill(color: number | null): void {
    for (const sprite of this.sprites.values()) {
      if (color === null) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
      else sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    }
  }

  setLit(enabled: boolean): void {
    for (const sprite of this.sprites.values()) sprite.setLighting(enabled);
  }
}
