import * as Phaser from 'phaser';
import type { FootholdWorld } from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { WEAPON_BY_ID } from '../inventory/catalog';
import type { LootItem } from '../inventory/model';
import { LOOT_SCROLL_KEY, LOOT_SCROLL_COLORS } from '../inventory/scrollArt';
import { DEPTH } from '../map/MapView';
import { SheetAnimator, frameName } from '../render/sheets';

type Phase = 'fall' | 'float' | 'magnet';

/** 圖案顯示後（含縮放、旋轉）的下緣形狀，相對中心點 */
interface Shape {
  /** 最下緣 */
  bottom: number;
  /** 每一欄（中心往右 dx）的最下緣；落地時每一欄都不能插進地面 */
  columns: { dx: number; bottom: number }[];
}

interface Pickup {
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  /** 金幣的旋轉動畫；物品沒有 */
  animator: SheetAnimator | null;
  /** 物品底下的光暈 */
  glow: Phaser.GameObjects.Ellipse | null;
  shape: Shape;
  /** 中心點正下方的地板（光暈貼著它）；底下沒有地板時是 null */
  groundY: number | null;
  /** 落地後中心點的高度，漂浮以它為準 */
  restY: number;
  /** 生成時的高度（怪物中心）。高過這裡的單向平台是往上噴時穿過的，不落在上面 */
  spawnY: number;
  /** 沒有足場資料時的地板（呼叫端給的） */
  fallbackFloor: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
/** 掉落武器圖示的最長邊（px） */
const WEAPON_SIZE = 40;

const SCROLL_SIZE = 34;
/** 漂浮時圖案最下緣離地板多高，再上下飄 ±HOVER_BOB */
const HOVER = 5;
const HOVER_BOB = 2.5;
/** 算不透明像素時，alpha 超過這個才算圖案 */
const ALPHA_SOLID = 40;
/** 下緣形狀每一欄的寬度（顯示 px） */
const COLUMN = 4;

/**
 * 掉落物（SPEC §4.6）：金幣、武器、卷軸從怪物身上噴出 → 落到地板 → 漂浮 1–1.5 秒 → 被吸到玩家身上。
 * 純演出：錢與背包在伺服器判定擊殺時就已經入帳。
 * 落點用足場判定：噴到斜坡、平台外、飛行怪死在半空都會落到實際的地板上，圖案下緣離地固定高度漂浮。
 */
export class Pickups {
  private items: Pickup[] = [];
  private elapsed = 0;
  /** 吸過去的位置（玩家身上，世界座標） */
  target: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  /** 目前地圖的足場；沒有時退回呼叫端給的 floorY */
  world: () => FootholdWorld | null = () => null;
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
      // 金幣邊轉邊換幀：都用正面那一幀（最寬）的形狀
      const shape = measureShape(sprite.texture.get(frameName(null, 0)), 0, sprite.scaleY);
      this.add(sprite, animator, null, shape, x, y, floorY, -i * 25, (Math.random() - 0.5) * 160, -190 - Math.random() * 90);
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
      // 武器：最長邊 40px、斜 45 度躺著，比卷軸醒目
      sprite.setScale(WEAPON_SIZE / Math.max(sprite.width, sprite.height)).setAngle(45);
      color = 0xffd86a;
    } else {
      if (!this.scene.textures.exists(LOOT_SCROLL_KEY)) return;
      sprite = this.scene.add.image(x, y, LOOT_SCROLL_KEY, String(loot.rate));
      sprite.setScale(SCROLL_SIZE / Math.max(sprite.width, sprite.height));
      color = LOOT_SCROLL_COLORS[loot.rate] ?? 0xffffff;
    }
    sprite.setDepth(DEPTH.fx + 2).setVisible(false);
    const weapon = loot.kind === 'weapon';
    const glow = this.scene.add.ellipse(x, floorY - 2, weapon ? 38 : 32, weapon ? 9 : 7, color, 0.35).setDepth(DEPTH.fx + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    // 每把武器的形狀與在圖格裡的位置都不同，斜放後的下緣要照實際圖案算，不能用固定偏移
    this.add(sprite, null, glow, measureShape(sprite.frame, sprite.rotation, sprite.scaleY), x, y, floorY, -120, (Math.random() - 0.5) * 120, -260);
  }

  /** 每個畫面；頓幀時 frozen = true，全部停住。 */
  update(dtMs: number, frozen: boolean): void {
    const dtRaw = frozen ? 0 : dtMs;
    this.elapsed += dtRaw;
    const dt = dtRaw / 1000;
    const target = this.target();
    const world = this.world();
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
        if (world) this.fallOnFootholds(p, world, dt);
        else this.fallOnFloor(p, dt);
      } else if (p.phase === 'float') {
        // 在地上浮起來上下飄，漂滿 1–1.5 秒才被吸走
        p.floatMs += dtRaw;
        const lift = Math.min(1, p.floatMs / 200) * HOVER;
        p.y = p.restY - lift - Math.sin((p.floatMs / 1000) * Math.PI * 2 * 1.1 + p.bob) * HOVER_BOB;
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
        p.glow.setVisible(p.phase !== 'magnet' && p.groundY !== null);
        if (p.groundY !== null) p.glow.setPosition(Math.round(p.x), Math.round(p.groundY - 2));
        p.glow.setAlpha(0.25 + Math.sin(this.elapsed / 180) * 0.1);
      }
      return true;
    });
  }

  clear(): void {
    for (const p of this.items) this.destroy(p);
    this.items = [];
  }

  /**
   * 掉落中：圖案下緣的每一欄沿移動路徑找由上往下穿過的足場，最先碰到的那一欄決定落點，
   * 斜坡、台階、平台邊緣都照實際高度，圖案不會有一角插進地面。牆擋住水平移動。
   */
  private fallOnFootholds(p: Pickup, world: FootholdWorld, dt: number): void {
    const wantX = p.x + p.vx * dt;
    const nextX = world.blockByWalls(p.x, wantX, p.y - p.shape.bottom, p.y + p.shape.bottom, 2);
    if (nextX !== wantX) p.vx = 0;
    const nextY = p.y + p.vy * dt;
    // 碰到時中心點的位置：往下掉時取最高的（最先碰到）
    let contact: { x: number; y: number; fh: number; groundY: number } | null = null;
    for (const c of p.shape.columns) {
      const hit = this.landing(world, p, p.x + c.dx, p.y + c.bottom, nextX + c.dx, nextY + c.bottom);
      if (hit && (!contact || hit.y - c.bottom < contact.y)) contact = { x: hit.x - c.dx, y: hit.y - c.bottom, fh: hit.fh, groundY: hit.y };
    }
    if (contact) {
      p.x = contact.x;
      p.y = contact.y;
      p.groundY = world.footholdY(contact.fh, p.x) ?? contact.groundY;
      this.land(p);
      return;
    }
    p.x = nextX;
    p.y = nextY;
    // 光暈先標在底下的地板；物品還在生成點上方時，從生成點往下找，略過頭頂的單向平台
    p.groundY = world.groundBelow(p.x, Math.max(p.y + p.shape.bottom, p.spawnY))?.y ?? null;
    // 掉出地圖底部（底下沒有地板）：直接吸走，錢早就入帳了
    if (p.y - p.shape.bottom > world.height) p.phase = 'magnet';
  }

  /** 一個點由上往下穿過的足場；往上噴時穿過的單向平台（高過生成點）不算，物品會落回怪物所在的地板。 */
  private landing(world: FootholdWorld, p: Pickup, x0: number, y0: number, x1: number, y1: number): { fh: number; x: number; y: number } | null {
    let ignore: number | null = null;
    for (let tries = 0; tries < 3; tries += 1) {
      const hit = world.findLanding(x0, y0, x1, y1, ignore);
      if (!hit || !world.isOneWay(hit.fh) || hit.y >= p.spawnY) return hit;
      ignore = hit.fh;
    }
    return null;
  }

  /** 沒有足場資料時：落在呼叫端給的固定高度。 */
  private fallOnFloor(p: Pickup, dt: number): void {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y + p.shape.bottom >= p.fallbackFloor && p.vy > 0) {
      p.y = p.fallbackFloor - p.shape.bottom;
      this.land(p);
    }
  }

  /** 剛碰到地面（位置已經貼齊）：往下掉時彈一下，彈不高了就開始漂浮；往上時（撞進上坡）只貼著地面。 */
  private land(p: Pickup): void {
    if (p.vy <= 0) return;
    p.vy = -p.vy * 0.35;
    p.vx *= 0.5;
    if (Math.abs(p.vy) < 50) {
      p.phase = 'float';
      p.restY = p.y;
      p.vx = 0;
      p.vy = 0;
    }
  }

  private add(
    sprite: Pickup['sprite'],
    animator: SheetAnimator | null,
    glow: Phaser.GameObjects.Ellipse | null,
    shape: Shape,
    x: number,
    y: number,
    floorY: number,
    delayMs: number,
    vx: number,
    vy: number,
  ): void {
    const p: Pickup = { sprite, animator, glow, shape, groundY: floorY, restY: y, spawnY: y, fallbackFloor: floorY, x, y, vx, vy, phase: 'fall', delayMs, floatMs: 0, floatFor: 1000 + Math.random() * 500, bob: Math.random() * Math.PI * 2, baseScale: sprite.scaleX };
    // 小怪的中心離地近，大圖的下緣一開始可能已經在地板下：先推到地面上再噴
    const ground = this.world()?.groundBelow(x, y);
    if (ground) {
      p.groundY = ground.y;
      p.y = Math.min(p.y, ground.y - shape.bottom);
    }
    this.items.push(p);
  }

  private destroy(p: Pickup): void {
    p.sprite.destroy();
    p.glow?.destroy();
  }

}

/** 量過的圖：材質｜圖格｜角度｜縮放 → 形狀 */
const shapeCache = new Map<string, Shape>();

/**
 * 量圖案（不透明像素）顯示後（含縮放、旋轉）的下緣形狀，同一張圖只量一次。
 * 讀不到像素時用旋轉後的外框估計。
 */
function measureShape(frame: Phaser.Textures.Frame, rotation: number, scale: number): Shape {
  const key = `${frame.texture.key}|${frame.name}|${rotation}|${scale}`;
  const cached = shapeCache.get(key);
  if (cached) return cached;
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const s = Math.abs(scale);
  const halfW = ((Math.abs(frame.realWidth * cos) + Math.abs(frame.realHeight * sin)) / 2) * s;
  const halfH = ((Math.abs(frame.realWidth * sin) + Math.abs(frame.realHeight * cos)) / 2) * s;
  let shape: Shape = { bottom: halfH, columns: [-halfW, 0, halfW].map((dx) => ({ dx, bottom: halfH })) };
  try {
    const w = frame.cutWidth;
    const h = frame.cutHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
    const pixels = context.getImageData(0, 0, w, h).data;
    // 像素中心相對圖中心的位置（有裁切的圖格要加回裁掉的邊）；再加上半顆像素旋轉後的大小
    const left = frame.x + 0.5 - frame.realWidth / 2;
    const top = frame.y + 0.5 - frame.realHeight / 2;
    const pad = (Math.abs(sin) + Math.abs(cos)) / 2;
    const columns = new Map<number, number>();
    let bottom = -Infinity;
    for (let y = 0; y < h; y += 1) {
      const py = top + y;
      for (let x = 0; x < w; x += 1) {
        if (pixels[(y * w + x) * 4 + 3]! <= ALPHA_SOLID) continue;
        const px = left + x;
        const rx = (px * cos - py * sin) * s;
        const ry = (px * sin + py * cos + pad) * s;
        const column = Math.round(rx / COLUMN);
        columns.set(column, Math.max(columns.get(column) ?? -Infinity, ry));
        bottom = Math.max(bottom, ry);
      }
    }
    if (columns.size > 0) shape = { bottom, columns: [...columns].map(([column, b]) => ({ dx: column * COLUMN, bottom: b })) };
  } catch {
    // 跨網域等原因讀不到像素：用外框
  }
  shapeCache.set(key, shape);
  return shape;
}
