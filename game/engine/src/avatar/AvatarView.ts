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
import { motionDuration } from './motions';
import type { WeaponDefinition } from '../inventory/catalog';
import { weaponRig } from '../inventory/weaponRig';
import { NINJA_BASE, NINJA_MOTIONS } from './outfits';

/** 角色需要的內容：原始人物 sheet 與武器部件；套服另由遊戲美術包提供。 */
export interface AvatarContent {
  base: SheetAsset;
  items: Map<string, { item: AvatarItem; sheet: SheetAsset }>;
}

/**
 * 角色：四職業共用同一個人物，武器與全身套服獨立換裝。
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
  private cosmetic: WeaponDefinition | null = null;
  private outfit: string | null = null;
  private get base(): SheetAsset { return this.outfit === 'ninja-1' ? NINJA_BASE : this.content.base; }
  private get motionKey(): string { return this.outfit === 'ninja-1' ? NINJA_MOTIONS.path : HERO_MOTIONS_KEY; }
  private readonly cosmeticSprite: Phaser.GameObjects.Sprite;
  /** body 合圖沒有獨立前手時，重畫握柄處的手掌，保留手指遮擋。 */
  private readonly gripOccluder: Phaser.GameObjects.Sprite;
  private readonly scabbardSprite: Phaser.GameObjects.Sprite;

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
    this.cosmeticSprite = scene.add.sprite(0, 0, '__MISSING').setVisible(false);
    this.add(this.cosmeticSprite);
    this.gripOccluder = scene.add.sprite(-AVATAR_CANVAS.footX, -AVATAR_CANVAS.footY, '__MISSING').setOrigin(0, 0).setVisible(false);
    this.add(this.gripOccluder);
    this.scabbardSprite = scene.add.sprite(0, 0, '__MISSING').setVisible(false);
    this.add(this.scabbardSprite);
    this.animator.play('stand');
  }

  /** 正在播技能整體動畫。 */
  get inMotion(): boolean {
    return this.motionOn;
  }

  /** 目前畫面上的整體動畫幀（殘影用）；沒有在播時為 null。 */
  get motionFrame(): { key: string; frame: string } | null {
    if (this.motionOn && this.cosmetic) return { key: this.base.path, frame: frameName('body', this.animator.frame) };
    return this.motionOn ? { key: this.motionKey, frame: frameName(null, this.motionAnimator.frame) } : null;
  }

  /** 播放技能整體動畫；素材沒有這個 Tag（或圖還沒載入）時回傳 false，呼叫端改播紙娃娃動作。 */
  playMotion(tag: string, options: { speed?: number; loop?: boolean } = {}): boolean {
    if (!this.scene.textures.exists(this.motionKey) || !this.motionAnimator.play(tag, { restart: true, loop: options.loop ?? false })) return false;
    this.motionAnimator.speed = options.speed ?? 1;
    this.motionOn = true;
    if (this.cosmetic) {
      const kind = this.cosmetic.kind;
      const pose = kind === 'staff' ? 'cast' : kind === 'bow' ? 'shoot' : kind === 'claw' ? (tag.includes('slash') ? 'swing2' : 'throw') : tag.includes('rising') ? 'swing2' : tag.includes('heavy') ? 'swing3' : 'swing1';
      this.animator.play(this.content.base.sheet.tags.has(pose) ? pose : 'swing1', { restart: true, loop: options.loop ?? false });
      const info = this.content.base.sheet.tags.get(this.animator.tag)!;
      let duration = 0;
      for (let i = info.from; i <= info.to; i++) duration += this.animator.duration(i);
      // 保持原技能時鐘，僅讓可換裝的紙娃娃姿勢配合該時長。
      this.animator.speed = duration / Math.max(1, motionDuration(tag)) * (options.speed ?? 1);
    }
    this.dirty = true;
    this.refresh();
    return true;
  }

  stopMotion(): void {
    if (!this.motionOn) return;
    this.motionOn = false;
    this.animator.speed = 1;
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

  setCosmeticWeapon(definition: WeaponDefinition | null): this {
    if (this.cosmetic?.id === definition?.id) return this;
    this.cosmetic = definition;
    this.cosmeticSprite.setVisible(!!definition);
    this.gripOccluder.setVisible(false);
    this.scabbardSprite.setVisible(false);
    this.dirty = true;
    this.refresh();
    return this;
  }

  /** One full-body costume shared across classes; keep both animation clocks intact. */
  setOutfit(id: string | null): this {
    const next = id === 'ninja-1' ? id : null;
    if (this.outfit === next) return this;
    this.outfit = next;
    this.textureKeys.set('base', this.base.path);
    this.dirty = true;
    this.refresh();
    return this;
  }

  /** 換武器（null = 空手）。 */
  setLoadout(loadout: AvatarLoadout): this {
    const parts: AvatarPart[] = [];
    const keys = new Map<string, string>([['base', this.base.path]]);
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
      if (this.cosmetic) { this.animator.update(dtMs); this.refresh(); return; }
      this.motionSprite.setFrame(frameName(null, this.motionAnimator.frame));
      return;
    }
    this.animator.update(dtMs);
    this.refresh();
  }

  /** 依目前幀擺好每個圖層。 */
  refresh(): void {
    if (this.motionOn && !this.cosmetic) {
      this.gripOccluder.setVisible(false);
      for (const sprite of this.sprites.values()) sprite.setVisible(false);
      this.motionSprite.setTexture(this.motionKey, frameName(null, this.motionAnimator.frame)).setVisible(true);
      this.dirty = true; // 回到紙娃娃時重畫
      return;
    }
    this.motionSprite.setVisible(false);
    const f = this.animator.frame;
    if (!this.dirty && f === this.lastFrame) return;
    this.lastFrame = f;
    this.dirty = false;
    const ops = composeAvatarFrame(this.base.sheet, this.resolved, f);
    const byLayer = new Map(ops.map((op) => [op.layer, op]));
    for (const layer of AVATAR_LAYERS) {
      const sprite = this.sprites.get(layer)!;
      const op = byLayer.get(layer);
      const key = op ? this.textureKeys.get(op.source) : undefined;
      if (!op || !key || (this.cosmetic && (layer === 'weapon' || layer === 'weapon_back'))) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setTexture(key, frameName(op.frameLayer, op.frameIndex));
      sprite.setPosition(-AVATAR_CANVAS.footX + op.dx, -AVATAR_CANVAS.footY + op.dy);
      sprite.setVisible(true);
    }
    if (this.cosmetic) {
      const def = this.cosmetic;
      const hand = this.content.base.sheet.slicePivotAt('hand', f) ?? { x: 48, y: 97 };
      const rig = weaponRig(def.kind, this.animator.tag, this.animator.index, this.animator.length);
      const size = rig.sheathed ? 44 : { sword: 68, staff: 90, bow: 72, claw: 24 }[def.kind];
      const grip = { sword: .79, staff: .72, bow: .5, claw: .80 }[def.kind];
      const torso = this.content.base.sheet.slicePivotAt('torso', f) ?? { x: 64, y: 106 };
      const hip = { x: torso.x + 3, y: torso.y - 5 };
      const attach = rig.sheathed ? hip : hand;
      this.cosmeticSprite.setTexture(`wardrobe-${def.kind}`, def.frame).setOrigin(.5, grip)
        .setDisplaySize(size * .6, size).setPosition(attach.x - AVATAR_CANVAS.footX, attach.y - AVATAR_CANVAS.footY).setAngle(rig.angle).setVisible(true);
      this.cosmeticSprite.setCrop();
      this.scabbardSprite.setVisible(def.kind === 'sword');
      if (def.kind === 'sword') {
        // 收劍只露護手與握柄，劍身進入真正的劍鞘；拔劍後空鞘仍留在腰間。
        const source = this.cosmeticSprite.frame;
        if (rig.sheathed) this.cosmeticSprite.setCrop(0, source.realHeight * .67, source.realWidth, source.realHeight * .33);
        const mouthOffset = (.79 - .67) * 44 / Math.SQRT2;
        this.scabbardSprite.setTexture('wardrobe-scabbard', def.frame).setOrigin(.5, .95).setDisplaySize(14.4, 24).setAngle(135)
          .setPosition(hip.x - AVATAR_CANVAS.footX + mouthOffset, hip.y - AVATAR_CANVAS.footY + mouthOffset);
        const beltLayer = this.getIndex(this.sprites.get('arm_front')!);
        this.moveTo(this.scabbardSprite, beltLayer - (this.getIndex(this.scabbardSprite) < beltLayer ? 1 : 0));
      }
      // 整個容器翻面，手與武器一起鏡射；不能依世界朝向硬交換前後手。
      const anchor = this.sprites.get(rig.plane === 'back' ? 'body' : 'arm_front')!;
      const anchorIndex = this.getIndex(anchor), weaponIndex = this.getIndex(this.cosmeticSprite);
      this.moveTo(this.cosmeticSprite, anchorIndex - (weaponIndex < anchorIndex ? 1 : 0));
      const hasFrontArm = this.content.base.sheet.frame('arm_front', f) !== undefined;
      const coverGrip = rig.plane === 'front' && !hasFrontArm && def.kind !== 'claw' && !rig.sheathed;
      this.gripOccluder.setVisible(coverGrip);
      if (coverGrip) {
        this.gripOccluder.setTexture(this.base.path, frameName('body', f))
          .setCrop(hand.x - 4, hand.y - 4, 8, 9);
        this.bringToTop(this.gripOccluder);
      }
    }
  }

  /** 受擊閃白等效果：套到所有圖層。 */
  setFill(color: number | null): void {
    for (const sprite of [...this.sprites.values(), this.motionSprite, this.cosmeticSprite, this.gripOccluder, this.scabbardSprite]) {
      if (color === null) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
      else sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    }
  }

  setLit(enabled: boolean): void {
    for (const sprite of [...this.sprites.values(), this.motionSprite, this.cosmeticSprite, this.gripOccluder, this.scabbardSprite]) sprite.setLighting(enabled);
  }
}
