import * as Phaser from 'phaser';
import {
  AVATAR_CANVAS,
  AVATAR_LAYERS,
  composeAvatarFrame,
  resolveLoadout,
  type AvatarItem,
  type AvatarLayer,
  type AvatarLoadout,
  type AvatarPart,
  type ResolvedLoadout,
} from '@lawn/shared';
import type { SheetAsset } from '../content/bundle';
import { SheetAnimator, frameName } from '../render/sheets';
import { HERO_MOTIONS_KEY, heroMotionsSheet } from './motions';

/** 角色需要的內容：人物 sheet 與武器部件。 */
export interface AvatarContent {
  base: SheetAsset;
  items: Map<string, { item: AvatarItem; sheet: SheetAsset }>;
}

/**
 * 角色：四職業共用同一個人物，只換武器（SPEC v0.6 §4.3）。
 * 每幀擺放由 @lawn/shared 的 composeAvatarFrame 計算（武器對齊 hand、weapon_back 對齊 torso），
 * 這裡只負責對到 Sprite。原點在腳底；美術面向左，facing = 1（右）時水平翻轉。
 */
export class AvatarView extends Phaser.GameObjects.Container {
  readonly animator: SheetAnimator;
  private readonly sprites = new Map<AvatarLayer, Phaser.GameObjects.Sprite>();
  private resolved: ResolvedLoadout = resolveLoadout([]);
  /** 'base' 或 itemId → texture key */
  private textureKeys = new Map<string, string>();
  private lastFrame = -1;
  private dirty = true;
  weapon: string | null = null;
  /** 技能整體動畫（人物 + 武器合圖）：播放時隱藏紙娃娃 */
  private readonly motionSprite: Phaser.GameObjects.Sprite;
  private readonly motionAnimator = new SheetAnimator(heroMotionsSheet);
  private motionOn = false;

  constructor(
    scene: Phaser.Scene,
    private readonly content: AvatarContent,
  ) {
    super(scene);
    scene.add.existing(this);
    this.animator = new SheetAnimator(content.base.sheet, 'body');
    for (const layer of AVATAR_LAYERS) {
      const sprite = scene.add.sprite(0, 0, '__MISSING').setOrigin(0, 0).setVisible(false);
      this.sprites.set(layer, sprite);
      this.add(sprite);
    }
    this.motionSprite = scene.add.sprite(-AVATAR_CANVAS.footX, -AVATAR_CANVAS.footY, '__MISSING').setOrigin(0, 0).setVisible(false);
    this.add(this.motionSprite);
    this.animator.play('stand');
  }

  /** 正在播技能整體動畫。 */
  get inMotion(): boolean {
    return this.motionOn;
  }

  /** 目前畫面上的整體動畫幀（殘影用）；沒有在播時為 null。 */
  get motionFrame(): { key: string; frame: string } | null {
    return this.motionOn ? { key: HERO_MOTIONS_KEY, frame: frameName(null, this.motionAnimator.frame) } : null;
  }

  /** 播放技能整體動畫；素材沒有這個 Tag（或圖還沒載入）時回傳 false，呼叫端改播紙娃娃動作。 */
  playMotion(tag: string, options: { speed?: number; loop?: boolean } = {}): boolean {
    if (!this.scene.textures.exists(HERO_MOTIONS_KEY) || !this.motionAnimator.play(tag, { restart: true, loop: options.loop ?? false })) return false;
    this.motionAnimator.speed = options.speed ?? 1;
    this.motionOn = true;
    this.dirty = true;
    this.refresh();
    return true;
  }

  stopMotion(): void {
    if (!this.motionOn) return;
    this.motionOn = false;
    this.dirty = true;
    this.refresh();
  }

  get frame(): number {
    return this.animator.frame;
  }

  setFacing(facing: 1 | -1): this {
    this.scaleX = facing === 1 ? -1 : 1;
    return this;
  }

  /** 換武器（null = 空手）。 */
  setLoadout(loadout: AvatarLoadout): this {
    const parts: AvatarPart[] = [];
    const keys = new Map<string, string>([['base', this.content.base.path]]);
    const entry = loadout.weapon ? this.content.items.get(loadout.weapon) : undefined;
    if (entry) {
      parts.push({ item: entry.item, sheet: entry.sheet.sheet });
      keys.set(entry.item.id, entry.sheet.path);
    }
    this.weapon = entry?.item.id ?? null;
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

  /** 推進動畫；頓幀時傳 0。 */
  tick(dtMs: number): void {
    if (this.motionOn) {
      this.motionAnimator.update(dtMs);
      this.motionSprite.setFrame(frameName(null, this.motionAnimator.frame));
      return;
    }
    this.animator.update(dtMs);
    this.refresh();
  }

  /** 依目前幀擺好每個圖層。 */
  refresh(): void {
    if (this.motionOn) {
      for (const sprite of this.sprites.values()) sprite.setVisible(false);
      this.motionSprite.setTexture(HERO_MOTIONS_KEY, frameName(null, this.motionAnimator.frame)).setVisible(true);
      this.dirty = true; // 回到紙娃娃時重畫
      return;
    }
    this.motionSprite.setVisible(false);
    const f = this.animator.frame;
    if (!this.dirty && f === this.lastFrame) return;
    this.lastFrame = f;
    this.dirty = false;
    const ops = composeAvatarFrame(this.content.base.sheet, this.resolved, f);
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
    for (const sprite of [...this.sprites.values(), this.motionSprite]) {
      if (color === null) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
      else sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    }
  }

  setLit(enabled: boolean): void {
    for (const sprite of [...this.sprites.values(), this.motionSprite]) sprite.setLighting(enabled);
  }
}
