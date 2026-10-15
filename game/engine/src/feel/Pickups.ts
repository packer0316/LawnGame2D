import * as Phaser from 'phaser';
import type { ContentBundle } from '../content/bundle';
import { WEAPON_BY_ID } from '../inventory/catalog';
import type { LootItem } from '../inventory/model';
import { DEPTH } from '../map/MapView';
import { SheetAnimator, frameName } from '../render/sheets';

type Phase = 'fall' | 'float' | 'magnet';

interface Pickup {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  /** 金幣的旋轉動畫；物品沒有 */
  animator: SheetAnimator | null;
  /** 物品底下的光暈 */
  glow: Phaser.GameObjects.Ellipse | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 落地高度（中心點） */
  restY: number;
  phase: Phase;
  /** 生成的延遲（金幣一顆顆噴出）；< 0 時還沒出現 */
  delayMs: number;
  /** 漂浮了多久、要漂多久（1–1.5 秒，不含掉落過程） */
  floatMs: number;
  floatFor: number;
  bob: number;
  baseScale: number;
}

const GRAVITY = 900;
/** 吸過來的加速度與最高速度 */
const MAGNET_ACCEL = 2600;
const MAGNET_MAX = 900;
const COLLECT_DISTANCE = 12;

const SCROLL_COLORS: Record<number, number> = { 10: 0xffcf5a, 60: 0x6fc7ff, 90: 0x8be08a };

/**
 * 掉落物（SPEC §4.6）：金幣、武器、卷軸從怪物身上噴出 → 落到地板 → 漂浮 1–1.5 秒 → 被吸到玩家身上。
 * 純演出：錢與背包在伺服器判定擊殺時就已經入帳。
 */
export class Pickups {
  private items: Pickup[] = [];
  private elapsed = 0;
  /** 吸過去的位置（玩家身上，世界座標） */
  target: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  onCollect: ((x: number, y: number, kind: 'coin' | 'item') => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
  ) {}

  get count(): number {
    return this.items.length;
  }

  coins(x: number, y: number, count: number, floorY: number): void {
    const asset = this.bundle.fx.get('coin');
    if (!asset) return;
    for (let i = 0; i < count; i += 1) {
      const animator = new SheetAnimator(asset.sheet);
      animator.play('play', { loop: true });
      animator.seek(i % 6);
      const sprite = this.scene.add.sprite(x, y, asset.path, frameName(null, animator.frame)).setDepth(DEPTH.fx + 1).setVisible(false);
      this.add(sprite, animator, null, x, y, floorY - 6, -i * 25, (Math.random() - 0.5) * 160, -190 - Math.random() * 90);
    }
  }

  /** 武器或卷軸：比金幣大、底下有光暈，彈得比較高。 */
  item(loot: LootItem, x: number, y: number, floorY: number): void {
    let sprite: Phaser.GameObjects.Image;
    let color: number;
    if (loot.kind === 'weapon') {
      const def = WEAPON_BY_ID.get(loot.definitionId);
      const key = def ? `wardrobe-${def.kind}` : '';
      if (!def || !this.scene.textures.exists(key)) return;
      sprite = this.scene.add.image(x, y, key, String(def.frame));
      sprite.setScale(26 / Math.max(sprite.width, sprite.height));
      color = 0xffd86a;
    } else {
      sprite = this.scene.add.image(x, y, this.scrollTexture(loot.rate));
      color = SCROLL_COLORS[loot.rate] ?? 0xffffff;
    }
    sprite.setDepth(DEPTH.fx + 2).setVisible(false);
    const glow = this.scene.add.ellipse(x, floorY - 2, 26, 7, color, 0.35).setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.add(sprite, null, glow, x, y, floorY - 14, -120, (Math.random() - 0.5) * 120, -260);
  }

  /** 每個畫面；頓幀時 frozen = true，全部停住。 */
  update(dtMs: number, frozen: boolean): void {
    const dtRaw = frozen ? 0 : dtMs;
    this.elapsed += dtRaw;
    const dt = dtRaw / 1000;
    const target = this.target();
    this.items = this.items.filter((p) => {
      p.delayMs += dtRaw;
      if (p.delayMs < 0) return true;
      p.sprite.setVisible(true);
      if (p.animator) {
        p.animator.update(dtRaw);
        (p.sprite as Phaser.GameObjects.Sprite).setFrame(frameName(null, p.animator.frame));
      }

      if (p.phase === 'fall') {
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y >= p.restY && p.vy > 0) {
          p.y = p.restY;
          p.vy = -p.vy * 0.35;
          p.vx *= 0.5;
          if (Math.abs(p.vy) < 50) {
            p.phase = 'float';
            p.vx = 0;
            p.vy = 0;
          }
        }
      } else if (p.phase === 'float') {
        // 在地上浮起來上下飄，漂滿 1–1.5 秒才被吸走
        p.floatMs += dtRaw;
        const lift = Math.min(1, p.floatMs / 200) * 5;
        p.y = p.restY - lift - Math.sin((p.floatMs / 1000) * Math.PI * 2 * 1.1 + p.bob) * 2.5;
        if (p.floatMs >= p.floatFor) p.phase = 'magnet';
      } else {
        // 吸過來：朝玩家加速，越近越快
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < COLLECT_DISTANCE) {
          this.onCollect?.(p.x, p.y, p.animator ? 'coin' : 'item');
          this.destroy(p);
          return false;
        }
        const speed = Math.min(MAGNET_MAX, Math.hypot(p.vx, p.vy) + MAGNET_ACCEL * dt);
        p.vx = (dx / dist) * speed;
        p.vy = (dy / dist) * speed;
        const step = Math.min(dist, speed * dt);
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        // 快碰到玩家時縮小，像被收進身上
        p.sprite.setScale(p.baseScale * Phaser.Math.Clamp(dist / 48, 0.45, 1));
      }

      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      if (p.glow) {
        p.glow.setVisible(p.phase !== 'magnet').setPosition(Math.round(p.x), Math.round(p.restY + 12));
        p.glow.setAlpha(0.25 + Math.sin(this.elapsed / 180) * 0.1);
      }
      return true;
    });
  }

  clear(): void {
    for (const p of this.items) this.destroy(p);
    this.items = [];
  }

  private add(
    sprite: Pickup['sprite'],
    animator: SheetAnimator | null,
    glow: Phaser.GameObjects.Ellipse | null,
    x: number,
    y: number,
    restY: number,
    delayMs: number,
    vx: number,
    vy: number,
  ): void {
    this.items.push({ sprite, animator, glow, x, y, vx, vy, restY, phase: 'fall', delayMs, floatMs: 0, floatFor: 1000 + Math.random() * 500, bob: Math.random() * Math.PI * 2, baseScale: sprite.scaleX });
  }

  private destroy(p: Pickup): void {
    p.sprite.destroy();
    p.glow?.destroy();
  }

  /** 卷軸圖示（程式畫）：捲起來的羊皮紙，中間的帶子用成功率的顏色。 */
  private scrollTexture(rate: number): string {
    const key = `loot-scroll-${rate}`;
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const color = SCROLL_COLORS[rate] ?? 0xffffff;
    g.fillStyle(0x6b4a2b, 1).fillRoundedRect(1, 3, 20, 14, 3);
    g.fillStyle(0xf1e3bd, 1).fillRect(4, 4, 14, 12);
    g.fillStyle(0xd9c48f, 1).fillRect(4, 13, 14, 2);
    g.fillStyle(color, 1).fillRect(9, 3, 4, 14);
    g.fillStyle(0x8b6a3e, 1).fillRect(0, 2, 3, 16).fillRect(19, 2, 3, 16);
    g.lineStyle(1, 0x3a2614, 1).strokeRoundedRect(0.5, 2.5, 21, 15, 3);
    g.generateTexture(key, 22, 20);
    g.destroy();
    return key;
  }
}
