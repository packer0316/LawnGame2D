import * as Phaser from 'phaser';
import type { FxPoint, SkillFxContext } from './SkillFx';
import { atlasKey } from './SkillAtlas';
import { reaperKey } from './ReaperSummonArt';
import { REAPER_TIMING as T, reaperClamp as clamp, reaperEase as ease, reaperPose } from './ReaperSummonTiming';

type Soul = { sprite: Phaser.GameObjects.Sprite; point: FxPoint; born: number };
type Burst = { sprite: Phaser.GameObjects.Sprite; point: FxPoint; born: number; last: boolean; index: number };

/** 一次揮刀與六次靈魂命中分開演出；所有動畫只使用固定遊戲時鐘。 */
export class ReaperSummon {
  elapsed = 0;
  active = true;
  private readonly objects = new Set<Phaser.GameObjects.GameObject>();
  private readonly souls = new Map<string, Soul>();
  private bursts: Burst[] = [];
  private readonly shade: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly trails: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Sprite;
  readonly body: Phaser.GameObjects.Sprite;
  private readonly startZoom: number;
  private readonly bounded: boolean;
  private readonly center: FxPoint;
  private lastHit = -Infinity;
  private final = false;

  constructor(private readonly scene: Phaser.Scene, private readonly ctx: SkillFxContext) {
    const cam = scene.cameras.main;
    this.startZoom = cam.zoom;
    this.bounded = cam.useBounds;
    this.center = { x: cam.worldView.centerX, y: cam.worldView.centerY };
    cam.stopFollow();
    cam.useBounds = false;
    this.shade = this.own(scene.add.graphics()).setDepth(50);
    this.trails = this.own(scene.add.graphics()).setDepth(63);
    this.overlay = this.own(scene.add.graphics()).setDepth(76);
    this.portrait = this.own(scene.add.sprite(0, 0, reaperKey('portrait'), 0)).setDepth(74);
    this.body = this.own(scene.add.sprite(0, 0, reaperKey('scythe'), 0)).setDepth(73).setVisible(false);
    this.render();
  }

  get count(): number { return this.objects.size; }
  private own<O extends Phaser.GameObjects.GameObject>(object: O): O {
    this.objects.add(object);
    object.once('destroy', () => this.objects.delete(object));
    return object;
  }

  step(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed >= T.end) { this.destroy(); return; }
    // 即使怪物在前幾拍全滅，殘留靈魂也要完成收束；這裡不建立傷害爆點。
    if (!this.final && this.elapsed >= T.hits[5]) { this.final = true; this.lastHit = this.elapsed; }
    this.render();
  }

  /** 只由實際命中回呼建立爆點；不另外扣血，也不重播揮鐮。 */
  contact(targets: FxPoint[], index: number, last: boolean): void {
    if (!this.active) return;
    this.lastHit = this.elapsed;
    this.final = last;
    for (const point of targets) {
      const sprite = this.own(this.scene.add.sprite(point.x, point.y - 12, atlasKey('soul'), 4))
        .setDepth(65).setDisplaySize(last ? 88 : 48, last ? 88 : 48);
      this.bursts.push({ sprite, point: { ...point }, born: this.elapsed, last, index });
    }
    this.render();
  }

  private render(): void {
    const ms = this.elapsed, cam = this.scene.cameras.main, bounds = this.ctx.bounds;
    const pose = reaperPose(ms), revealMap = ease((ms - T.cut) / 280), restore = ease((ms - T.restore) / (T.end - T.restore));
    const wide = Math.min(cam.width / (bounds.w + 40), cam.height / (bounds.h + 32));
    const blend = revealMap * (1 - restore);
    const hit = clamp(1 - (ms - this.lastHit) / (this.final ? 220 : 85));
    cam.setZoom((this.startZoom + (wide - this.startZoom) * blend) * (1 + hit * (this.final ? .025 : .006)));
    cam.centerOn(this.center.x + (bounds.x + bounds.w / 2 - this.center.x) * blend,
      this.center.y + (bounds.y + bounds.h / 2 - this.center.y) * blend);
    // Phaser 的 worldView 在 render 才更新，這裡依目前 zoom 計算畫面範圍。
    const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
    const x = cx - w / 2, y = cy - h / 2, fade = clamp(ms / 150) * clamp((T.end - ms) / 300);
    this.shade.setDepth(ms < T.cut ? 70 : 50).clear().fillStyle(0x070311, (ms < T.cut ? .48 : .56) * fade).fillRect(x - 20, y - 20, w + 40, h + 40);
    this.overlay.clear().fillStyle(0x03020a, .96 * fade).fillRect(x, y, w, h * .065).fillRect(x, y + h * .935, w, h * .065);
    this.overlay.fillStyle(0x03020a, revealMap * fade);
    if (y < bounds.y) this.overlay.fillRect(x, y, w, bounds.y - y);
    if (y + h > bounds.y + bounds.h) this.overlay.fillRect(x, bounds.y + bounds.h, w, y + h - bounds.y - bounds.h);
    if (x < bounds.x) this.overlay.fillRect(x, y, bounds.x - x, h);
    if (x + w > bounds.x + bounds.w) this.overlay.fillRect(bounds.x + bounds.w, y, x + w - bounds.x - bounds.w, h);

    // 臉部先抬頭與凝視，保持一拍後才拉遠；最後用短交疊接到上半身。
    const cross = ease((ms - (T.reveal - 200)) / 200);
    const portraitSize = h * (1.52 - .86 * pose.pullback);
    this.portrait.setFrame(pose.portrait).setPosition(cx, cy - h * .13 * pose.pullback)
      .setDisplaySize(portraitSize, portraitSize).setAlpha(fade * (1 - cross)).setVisible(ms < T.reveal);
    const bodySize = h * (1.46 - .70 * revealMap);
    this.body.setFrame(pose.body).setPosition(cx, cy + h * (.04 - .28 * revealMap))
      .setDisplaySize(bodySize, bodySize).setAlpha(cross * fade * (1 - revealMap * .66))
      .setVisible(cross > 0 && ms < T.restore + 150).setFlipX(this.ctx.facing === -1);

    this.trails.clear();
    // 唯一一刀：從蓄力到收勢只走一次，後面的傷害只顯示魂爆。
    if (ms >= T.cut && ms < T.cutEnd) {
      const t = pose.cut, direction = this.ctx.facing;
      const sx = cx - direction * w * .42, sy = cy - h * .17;
      const ex = cx + direction * w * .48, ey = cy + h * .13;
      const headX = sx + (ex - sx) * ease(t), headY = sy + (ey - sy) * ease(t);
      this.trails.lineStyle(h * .018, 0x8b4ce9, .7 * (1 - t)).lineBetween(sx, sy, headX, headY);
      this.trails.lineStyle(h * .004, 0xf0e6ff, 1 - t).lineBetween(sx, sy, headX, headY);
    }
    if (ms >= T.gaze && ms < T.gaze + 110) {
      const alpha = (1 - (ms - T.gaze) / 110) * .22;
      this.overlay.fillStyle(0xd3b4ff, alpha).fillRect(cx - w * .23, cy - h * .01, w * .46, Math.max(1, h * .002));
    }
    if (hit > 0) this.overlay.fillStyle(0xddcaff, hit * (this.final ? .09 : .018)).fillRect(x, y, w, h);

    const focus = { x: cx, y: cy - h * .27 };
    if (ms >= T.souls) this.renderSouls(focus, fade);
    this.bursts = this.bursts.filter(burst => {
      const age = ms - burst.born, life = burst.last ? 420 : 145, t = clamp(age / life);
      if (age >= life) { burst.sprite.destroy(); return false; }
      burst.sprite.setFrame(4 + Math.min(3, Math.floor(t * 4))).setAlpha((1 - t) * .95);
      const p = burst.point, radius = (burst.last ? 34 : 18) * (1 - ease(t)) + 4;
      this.trails.lineStyle(burst.last ? 2.5 : 1.5, 0xd9b7ff, (1 - t) * .9).strokeCircle(p.x, p.y - 10, radius);
      // 每次爆點向內收縮；細短射線集中在怪物身上，避免鋪滿整個畫面。
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + burst.index * .45;
        this.trails.lineStyle(1.5, 0xf5eaff, 1 - t).lineBetween(
          p.x + Math.cos(angle) * radius * 1.7, p.y - 10 + Math.sin(angle) * radius * 1.7,
          p.x + Math.cos(angle) * radius * .35, p.y - 10 + Math.sin(angle) * radius * .35);
      }
      return true;
    });
  }

  private renderSouls(focus: FxPoint, fade: number): void {
    const ms = this.elapsed, b = this.ctx.bounds;
    const targets = this.ctx.targetsAt?.(b.x + b.w / 2, b.y + b.h / 2, Math.hypot(b.w, b.h)) ?? this.ctx.targets;
    const current = new Map(targets.map((point, i) => [point.id ?? `target-${i}`, point]));
    // 所有活著的怪都有靈魂，不使用一般特效的 18 隻裁切上限。
    if (!this.final) for (const [key, point] of current) {
      if (this.souls.has(key)) continue;
      const sprite = this.own(this.scene.add.sprite(point.x, point.y, atlasKey('soul'), 6))
        .setDepth(62).setOrigin(.5, .85).setTint(0xddc8ff);
      this.souls.set(key, { sprite, point: { ...point }, born: ms });
    }
    const beat = clamp(1 - (ms - this.lastHit) / (this.final ? 330 : 105));
    for (const [key, soul] of this.souls) {
      const live = current.get(key);
      if (live && !this.final) soul.point = { ...live };
      const rise = ease((ms - soul.born) / 145), gather = this.final ? ease((ms - this.lastHit) / 360) : 0;
      const px = soul.point.x, py = soul.point.y - 12 - rise * 34;
      const sx = px + (focus.x - px) * gather, sy = py + (focus.y - py) * gather;
      const size = (52 + rise * 10) * (1 - beat * .16) * (1 - gather * .65);
      soul.sprite.setFrame(6).setPosition(sx, sy).setDisplaySize(size, size).setAlpha(fade * rise * (.65 + beat * .3) * (1 - gather));
      if (gather > 0 && gather < 1) this.trails.lineStyle(1, 0xc898ff, (1 - gather) * .4)
        .lineBetween(sx, sy, sx + (px - sx) * .16, sy + (py - sy) * .16);
    }
  }

  destroy(): void {
    if (!this.active) return;
    this.active = false;
    for (const object of [...this.objects]) object.destroy();
    this.souls.clear();
    this.bursts = [];
    const cam = this.scene.cameras.main;
    if (cam) cam.useBounds = this.bounded;
    if (this.scene.sys.isActive() && cam) {
      cam.setZoom(this.startZoom).centerOn(this.center.x, this.center.y);
      this.ctx.restoreCamera?.();
    }
  }
}
