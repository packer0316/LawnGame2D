import * as Phaser from 'phaser';
import type { Rect } from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { DEPTH } from '../map/MapView';
import { frameName } from '../render/sheets';
import type { FxLayer } from './FxLayer';

export interface FxPoint {
  x: number;
  y: number;
}

/** 一個技能特效需要的資訊（世界座標）。 */
export interface SkillFxContext {
  /** 角色腳底 */
  x: number;
  y: number;
  facing: 1 | -1;
  /** 這一刀的判定範圍；演出時點（cue）時為下一刀的範圍 */
  area: Rect | null;
  /** 打中的怪（判定框中心） */
  targets: FxPoint[];
  /** 技能開始時的位置（path、瞬移、衝刺的起點） */
  origin: FxPoint | null;
  /** 連鎖：上一個點（上一隻怪或出手位置） */
  from: FxPoint | null;
  /** 押注等級顏色 */
  tint: number;
  /** cue 到下一刀判定的時間（隕石落下要多久） */
  leadMs: number;
  /** 鏡頭看得到的範圍 */
  view: Rect;
  /** 整張地圖（全地圖大絕招用） */
  bounds: Rect;
  /** 散射技能挑好的點（分身飛鏢、影分身） */
  points: FxPoint[];
  /** x 處從 fromY 往下第一個地面的高度 */
  groundAt: (x: number, fromY: number) => number | null;
  /** 角色目前的整體動畫幀（殘影、分身用） */
  frame: { key: string; frame: string } | null;
  /** 到這個技能最後一刀還有多久（持續型特效用） */
  remainingMs: number;
  /** 這個技能往前打得到多遠 */
  reach: number;
}

const CHEST = 26;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * 技能的程式特效（SPEC §4.6）：閃電、隕石、衝擊波、箭雨、殘影、大絕招…
 * 目前是「示意」：用 Graphics + tween 畫出範圍與節奏，之後由美術（Codex）換成正式特效。
 * 大小都跟著判定範圍走，改技能範圍時特效會一起變。換房時 clear() 全部清掉。
 */
export class SkillFx {
  private readonly objects = new Set<Phaser.GameObjects.GameObject>();
  private readonly lights = new Set<Phaser.GameObjects.Light>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
    /** 播完就消失的 sprite 特效（塵土、火花、刀光）交給 FxLayer */
    private readonly oneShots: FxLayer,
    private readonly lit: () => boolean,
  ) {}

  play(name: string, ctx: SkillFxContext): void {
    switch (name) {
      case 'whirl':
        return this.whirl(ctx);
      case 'iaido':
        return this.iaido(ctx);
      case 'quake':
        return this.quake(ctx);
      case 'streak':
        return this.streak(ctx);
      case 'rising':
        return this.rising(ctx);
      case 'wave':
        return this.wave(ctx);
      case 'lightning':
        return this.lightning(ctx);
      case 'meteor':
        return this.meteor(ctx);
      case 'impact':
        return this.impact(ctx);
      case 'arcane':
        return this.arcane(ctx);
      case 'nova':
        return this.nova(ctx);
      case 'chainBolt':
        return this.chainBolt(ctx);
      case 'arrowUp':
        return this.arrowUp(ctx);
      case 'arrowRain':
        return this.arrowRain(ctx, ctx.area, 1);
      case 'arrowFan':
        return this.fan(ctx, 'arrow', 7);
      case 'bladeFan':
        return this.fan(ctx, 'shuriken', 7);
      case 'shadowSlash':
        return this.shadowSlash(ctx);
      case 'pathSlash':
        return this.pathSlash(ctx);
      case 'boomerang':
        return this.boomerang(ctx);
      case 'explosion':
        return this.explosion(ctx.x, ctx.y, 1.6, 0xffa040);
      // 大絕招（全地圖）
      case 'skyFlash':
        return this.skyFlash(0xfff1c8);
      case 'holyWave':
        return this.holyWave(ctx);
      case 'holyHit':
        return this.targetCuts(ctx, 0xffe08a);
      case 'swordRain':
        return this.swordRain(ctx);
      case 'meteorShower':
        return this.meteorShower(ctx);
      case 'summonCircle':
        return this.summonCircle(ctx);
      case 'reaper':
        return this.reaper(ctx);
      case 'reaperSweep':
        return this.reaperSweep(ctx);
      case 'darkBurst':
        return this.darkBurst(ctx);
      case 'arrowVolley':
        return this.arrowVolley(ctx);
      case 'screenArrowRain':
        return this.arrowRain(ctx, ctx.bounds, 1.6);
      case 'comet':
        return this.comet(ctx);
      case 'cometBurst':
        return this.cometBurst(ctx);
      case 'shurikenStorm':
        return this.shurikenStorm(ctx);
      case 'shurikenSpin':
        return this.pointRings(ctx, 0xbff0ff);
      case 'shadowClones':
        return this.shadowClones(ctx);
      case 'cloneSlash':
        return this.cloneSlash(ctx);
    }
  }

  /** 殘影：目前的整體動畫幀，冷色、加亮、淡出。 */
  afterimage(frame: { key: string; frame: string }, x: number, y: number, facing: 1 | -1, color = 0x7fd8ff, alpha = 0.55, duration = 280): Phaser.GameObjects.Sprite {
    const ghost = this.track(this.scene.add.sprite(x, y, frame.key, frame.frame))
      .setOrigin(64 / 128, 120 / 128)
      .setFlipX(facing === 1)
      .setDepth(DEPTH.player - 1)
      .setTint(color)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.fade(ghost, duration);
    return ghost;
  }

  /** 爆炸：explosion sprite + 衝擊環 + 光。 */
  explosion(x: number, y: number, scale: number, color: number): void {
    this.oneShots.spawn('explosion', x, y - 10, { scale, additive: true, tint: color });
    this.ring(x, y - 12, 10, 60 * scale, 0xffd08a, 4, 320);
    this.flash(x, y - 20, color, 160 * scale, 2.2, 380);
  }

  clear(): void {
    const objects = [...this.objects];
    this.scene.tweens.killTweensOf(objects);
    for (const object of objects) object.destroy();
    this.objects.clear();
    for (const light of this.lights) this.scene.lights.removeLight(light);
    this.lights.clear();
  }

  // ---------------------------------------------------------------------------
  // 劍士
  // ---------------------------------------------------------------------------

  /** 旋風斬：身體周圍轉一圈的刀光環（半徑 = 判定半徑）。 */
  private whirl(ctx: SkillFxContext): void {
    const r = (ctx.area?.w ?? 180) / 2;
    const g = this.gfx(ctx.x, ctx.y - CHEST);
    for (let i = 0; i < 3; i += 1) {
      const start = (i / 3) * Math.PI * 2;
      g.lineStyle(8, ctx.tint, 0.35).beginPath().arc(0, 0, r * 0.8, start, start + 1.4).strokePath();
      g.lineStyle(2, 0xffffff, 0.95).beginPath().arc(0, 0, r * 0.8, start + 0.2, start + 1.3).strokePath();
    }
    g.setScale(0.6, 0.45);
    this.fade(g, 260, { rotation: -ctx.facing * Math.PI * 1.4, scaleX: 1.25, scaleY: 0.9 });
    this.sparks(ctx.targets);
  }

  /** 拔刀斬：起點到終點一道白光，在每隻怪身上爆開斬痕。 */
  private iaido(ctx: SkillFxContext): void {
    const area = ctx.area;
    const y = ctx.y - CHEST;
    const x1 = area ? area.x : Math.min(ctx.origin?.x ?? ctx.x, ctx.x);
    const x2 = area ? area.x + area.w : Math.max(ctx.origin?.x ?? ctx.x, ctx.x);
    const h = area?.h ?? 70;
    const g = this.gfx(0, 0);
    g.fillStyle(0x9fe8ff, 0.3).fillRect(x1, y - h * 0.12, x2 - x1, h * 0.24);
    g.fillStyle(0xffffff, 1).fillRect(x1, y - 1.5, x2 - x1, 3);
    this.fade(g, 340);
    for (const t of ctx.targets) {
      this.cut(t.x, t.y, 32, ctx.tint);
      this.oneShots.spawn('slash_swing3', t.x, t.y, { additive: true, flipX: ctx.facing === 1, tint: ctx.tint });
    }
    this.flash((x1 + x2) / 2, y, 0xcff4ff, 260, 2, 300);
    this.sparks(ctx.targets);
  }

  /** 地裂重劈：這一段地面冒出岩刺與塵土（數量跟著範圍寬度）。 */
  private quake(ctx: SkillFxContext): void {
    const area = ctx.area;
    if (!area) return;
    const count = Math.max(3, Math.round(area.w / 35));
    for (let i = 0; i < count; i += 1) {
      const x = area.x + ((i + 0.5) / count) * area.w + rand(-8, 8);
      const ground = ctx.groundAt(x, ctx.y - 30) ?? ctx.y;
      const h = rand(26, area.h * 0.5);
      const spike = this.gfx(x, ground, false);
      spike.fillStyle(0x6b5137, 1).fillTriangle(-10, 0, 10, 0, rand(-3, 3), -h);
      spike.fillStyle(0xc9a874, 1).fillTriangle(-3, -h * 0.35, 3, -h * 0.35, rand(-2, 2), -h);
      spike.setScale(1, 0);
      this.scene.tweens.add({ targets: spike, scaleY: 1, duration: 70, ease: 'Back.Out' });
      this.fade(spike, 260, {}, 160);
      if (i % 2 === 0) this.oneShots.spawn('dust', x, ground - 6, { scale: 1.3 });
    }
    this.flash(area.x + area.w / 2, ctx.y - 10, 0xffc27a, area.w, 1.2, 260);
    this.sparks(ctx.targets);
  }

  /** 突刺、穿透箭：一道貫穿的光束（粗細跟著範圍高度）。 */
  private streak(ctx: SkillFxContext): void {
    const area = ctx.area;
    const y = ctx.y - CHEST;
    const x1 = area ? area.x : ctx.x;
    const x2 = area ? area.x + area.w : ctx.x + ctx.facing * 300;
    const thick = Math.max(10, (area?.h ?? 30) * 0.4);
    const g = this.gfx(0, 0);
    g.fillStyle(ctx.tint === 0xffffff ? 0xbff0ff : ctx.tint, 0.4).fillRect(Math.min(x1, x2), y - thick / 2, Math.abs(x2 - x1), thick);
    g.fillStyle(0xffffff, 1).fillRect(Math.min(x1, x2), y - 2, Math.abs(x2 - x1), 4);
    this.fade(g, 260);
    const tip = ctx.facing === 1 ? Math.max(x1, x2) : Math.min(x1, x2);
    const head = this.gfx(tip, y);
    head.fillStyle(0xffffff, 1).fillTriangle(0, -thick * 0.7, 0, thick * 0.7, ctx.facing * thick * 1.6, 0);
    this.fade(head, 260);
    this.flash(tip, y, 0xcff4ff, 150, 1.5, 240);
    this.sparks(ctx.targets);
  }

  /** 昇龍斬：往上的月牙刀光（大小跟著判定半徑）。 */
  private rising(ctx: SkillFxContext): void {
    const r = (ctx.area?.w ?? 170) / 2.6;
    const g = this.gfx(ctx.x + ctx.facing * 16, ctx.y - 40);
    const a0 = ctx.facing === 1 ? Math.PI * 0.35 : Math.PI * 0.65;
    const a1 = ctx.facing === 1 ? -Math.PI * 0.55 : Math.PI * 1.55;
    g.lineStyle(12, ctx.tint, 0.35).beginPath().arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1)).strokePath();
    g.lineStyle(3, 0xffffff, 1).beginPath().arc(0, 0, r, Math.min(a0, a1) + 0.1, Math.max(a0, a1) - 0.1).strokePath();
    this.fade(g, 280, { y: g.y - 40, scaleX: 1.15 });
    this.sparks(ctx.targets);
  }

  /** 劍氣斬：每一段範圍飛過一道月牙劍氣（高度跟著範圍）。 */
  private wave(ctx: SkillFxContext): void {
    const area = ctx.area;
    if (!area) return;
    this.crescent(ctx.facing === 1 ? area.x : area.x + area.w, ctx.y - CHEST, area.h / 2, ctx.facing, ctx.facing * area.w, 90, ctx.tint === 0xffffff ? 0xa8f0ff : ctx.tint);
    this.sparks(ctx.targets);
  }

  // ---------------------------------------------------------------------------
  // 法師
  // ---------------------------------------------------------------------------

  /** 雷電術：每隻目標從天而降一道閃電；沒打到也在範圍內落雷。 */
  private lightning(ctx: SkillFxContext): void {
    const points = ctx.targets.length > 0 ? ctx.targets : this.randomPoints(ctx.area, 3, ctx.y - 20);
    for (const p of points) {
      this.bolt(p.x + rand(-30, 30), p.y - 300, p.x, p.y, 0x8fd8ff, 220);
      this.ring(p.x, p.y + 12, 4, 30, 0xc8f0ff, 2, 220);
      this.flash(p.x, p.y, 0x9fdcff, 140, 2.4, 220);
    }
    this.sparks(ctx.targets);
  }

  /** 連鎖閃電：從上一個點跳到這隻怪。 */
  private chainBolt(ctx: SkillFxContext): void {
    const target = ctx.targets[0];
    if (!target) return;
    const from = ctx.from ?? { x: ctx.x + ctx.facing * 14, y: ctx.y - CHEST };
    this.bolt(from.x, from.y, target.x, target.y, 0xb9a2ff, 200);
    this.flash(target.x, target.y, 0xb9a2ff, 110, 2, 200);
    this.sparks(ctx.targets);
  }

  /** 隕石術（cue）：火球從後上方斜斜落到範圍中央，leadMs 後撞地。 */
  private meteor(ctx: SkillFxContext): void {
    const area = ctx.area;
    const impactX = area ? area.x + area.w / 2 : ctx.x + ctx.facing * 200;
    this.fallingMeteor(impactX - ctx.facing * 260, ctx.y - 400, impactX, ctx.y - 10, Math.max(120, ctx.leadMs), 1.3);
  }

  /** 隕石撞擊：大爆炸、衝擊環、塵土。 */
  private impact(ctx: SkillFxContext): void {
    const area = ctx.area;
    const x = area ? area.x + area.w / 2 : ctx.x + ctx.facing * 200;
    const w = area?.w ?? 340;
    this.explosion(x, ctx.y, 2.8, 0xffa040);
    this.ring(x, ctx.y - 4, 20, w * 0.6, 0xffe0a0, 5, 420, 0.35);
    for (let i = 0; i < 6; i += 1) this.oneShots.spawn('dust', x + rand(-w / 2, w / 2), ctx.y - 6, { scale: 1.6 });
    this.sparks(ctx.targets);
  }

  /** 瞬移術：起點與終點各一個法陣環，路線上一串星點。 */
  private arcane(ctx: SkillFxContext): void {
    const from = ctx.origin ?? { x: ctx.x, y: ctx.y };
    this.ring(from.x, from.y - CHEST, 6, 56, 0xc59bff, 3, 300);
    this.ring(ctx.x, ctx.y - CHEST, 6, 56, 0x9fe8ff, 3, 300);
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const star = this.gfx(from.x + (ctx.x - from.x) * t, from.y + (ctx.y - from.y) * t - CHEST + rand(-16, 16));
      star.fillStyle(i % 2 === 0 ? 0xd8c2ff : 0xa8f0ff, 1).fillTriangle(0, -5, 4, 0, 0, 5).fillTriangle(0, -5, -4, 0, 0, 5);
      this.fade(star, 320, { y: star.y - 12, angle: 90 }, i * 10);
    }
    this.flash(from.x, from.y - CHEST, 0xc59bff, 140, 1.8, 260);
    this.sparks(ctx.targets);
  }

  /** 冰霜新星：向外擴散的冰環與冰晶（半徑 = 判定半徑）。 */
  private nova(ctx: SkillFxContext): void {
    const r = (ctx.area?.w ?? 280) / 2;
    const cx = ctx.x;
    const cy = ctx.y - CHEST;
    this.ring(cx, cy, 16, r, 0xbff4ff, 6, 380, 0.6);
    this.ring(cx, cy, 10, r * 0.75, 0xffffff, 2, 320, 0.6);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const shard = this.gfx(cx + Math.cos(a) * 20, cy + Math.sin(a) * 12);
      shard.fillStyle(0xd8f8ff, 1).fillTriangle(-3, 0, 3, 0, 0, -16).setRotation(a + Math.PI / 2);
      this.fade(shard, 360, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.6 });
    }
    this.flash(cx, cy, 0x9fe8ff, r * 1.4, 2, 360);
    this.sparks(ctx.targets);
  }

  // ---------------------------------------------------------------------------
  // 弓箭手、刺客
  // ---------------------------------------------------------------------------

  /** 箭雨（cue）：先往天上射一支箭。 */
  private arrowUp(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 8;
    const y = ctx.y - 34;
    const arrow = this.fxSprite('arrow', x, y);
    arrow?.setRotation(Math.PI / 2).setScale(1.2);
    if (arrow) this.fade(arrow, 260, { y: y - 300 });
    const g = this.gfx(0, 0);
    g.fillStyle(0xffffff, 0.8).fillRect(x - 1, y - 300, 2, 300);
    this.fade(g, 220);
  }

  /** 箭雨：範圍內的箭從天而降，落在各處地面（density 越大越密）。 */
  private arrowRain(ctx: SkillFxContext, area: Rect | null, density: number): void {
    if (!area) return;
    const count = Math.min(120, Math.round((area.w / 30) * density));
    for (let i = 0; i < count; i += 1) {
      const x = area.x + rand(0, area.w);
      const land = (ctx.groundAt(x, area.y + rand(0, area.h * 0.5)) ?? Math.min(area.y + area.h, ctx.y)) - rand(2, 14);
      const top = Math.max(area.y, land - 260) - 40;
      const arrow = this.fxSprite('arrow', x, top);
      if (!arrow) continue;
      arrow.setRotation(-Math.PI / 2).setAlpha(0).setScale(density > 1 ? 1.3 : 1);
      this.scene.tweens.add({ targets: arrow, alpha: 1, y: land, duration: 150, delay: rand(0, 120), ease: 'Quad.In', onComplete: () => this.fade(arrow, 160) });
    }
    this.sparks(ctx.targets);
  }

  /** 扇形散射：箭或飛刃從胸前向前張開（距離 = 判定半徑）。 */
  private fan(ctx: SkillFxContext, fxId: string, count: number): void {
    const distance = (ctx.area?.w ?? 500) / 2;
    const spread = fxId === 'shuriken' ? 0.7 : 0.45;
    const x = ctx.x + ctx.facing * 10;
    const y = ctx.y - CHEST;
    for (let i = 0; i < count; i += 1) {
      const a = (ctx.facing === 1 ? 0 : Math.PI) - spread + (2 * spread * i) / (count - 1);
      const item = this.fxSprite(fxId, x, y);
      if (!item) continue;
      item.setRotation(a + Math.PI).setScale(1.3);
      this.fade(item, 240, { x: x + Math.cos(a) * distance, y: y + Math.sin(a) * distance, ...(fxId === 'shuriken' ? { angle: 720 } : {}) });
    }
    this.sparks(ctx.targets);
  }

  /** 影襲：從上一個位置到這裡一道暗影，在目標身上交叉斬。 */
  private shadowSlash(ctx: SkillFxContext): void {
    if (ctx.from) {
      const g = this.gfx(0, 0);
      g.lineStyle(10, 0x5b3a8c, 0.45).lineBetween(ctx.from.x, ctx.from.y - CHEST, ctx.x, ctx.y - CHEST);
      g.lineStyle(2, 0xe0c8ff, 0.9).lineBetween(ctx.from.x, ctx.from.y - CHEST, ctx.x, ctx.y - CHEST);
      this.fade(g, 220);
    }
    for (const t of ctx.targets) this.xSlash(t.x, t.y, 24, 0x8f5bd6);
    this.sparks(ctx.targets);
  }

  /** 疾風連斬：衝刺路線上的斜斬痕。 */
  private pathSlash(ctx: SkillFxContext): void {
    const from = ctx.origin ?? { x: ctx.x - ctx.facing * 200, y: ctx.y };
    const y = ctx.y - CHEST;
    const steps = Math.max(4, Math.round(Math.abs(ctx.x - from.x) / 60));
    for (let i = 0; i < steps; i += 1) {
      const x = from.x + ((ctx.x - from.x) * (i + 0.5)) / steps;
      const g = this.gfx(x, y + rand(-8, 8));
      g.lineStyle(6, ctx.tint === 0xffffff ? 0xd6c2ff : ctx.tint, 0.4).lineBetween(-18, 22, 18, -22);
      g.lineStyle(2, 0xffffff, 1).lineBetween(-17, 20, 17, -20);
      g.setScale(0.2, 1);
      this.fade(g, 240, { scaleX: 1 }, i * 20);
    }
    this.sparks(ctx.targets);
  }

  /** 迴旋刃（cue）：大飛刃飛出去再飛回來（距離 = 技能射程）。 */
  private boomerang(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 12;
    const y = ctx.y - CHEST;
    const blade = this.fxSprite('shuriken', x, y);
    if (!blade) return;
    blade.setScale(2.2).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: blade, angle: 1440, duration: 440 });
    this.scene.tweens.add({ targets: blade, x: x + ctx.facing * ctx.reach, duration: 210, ease: 'Sine.Out', yoyo: true, onComplete: () => blade.destroy() });
  }

  // ---------------------------------------------------------------------------
  // 大絕招：全地圖（示意）
  // ---------------------------------------------------------------------------

  /** 全畫面閃一下。 */
  private skyFlash(color: number): void {
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(220, c.red, c.green, c.blue);
  }

  /** 聖劍斬（cue）：巨大的金色劍氣從角色往左右兩邊飛到地圖盡頭。 */
  private holyWave(ctx: SkillFxContext): void {
    const r = 190;
    const y = ctx.y - CHEST - 20;
    const duration = 520;
    for (const dir of [1, -1] as const) {
      const distance = dir === 1 ? ctx.bounds.x + ctx.bounds.w - ctx.x : ctx.x - ctx.bounds.x;
      const wave = this.crescent(ctx.x + dir * 10, y, r, dir, dir * distance, duration, 0xffe08a);
      const trail = this.scene.time.addEvent({
        delay: 40,
        repeat: Math.floor(duration / 40) - 1,
        callback: () => {
          const ghost = this.gfx(wave.x, wave.y);
          drawCrescent(ghost, r * 0.95, dir, 0xfff1c8, 0.25);
          this.fade(ghost, 200);
        },
      });
      wave.once(Phaser.GameObjects.Events.DESTROY, () => trail.remove());
    }
    this.flash(ctx.x, y, 0xffe08a, 300, 2.6, 320);
    this.skyFlash(0xfff1c8);
  }

  /** 天劍降臨：巨劍從天而降插滿整張地圖的地面。 */
  private swordRain(ctx: SkillFxContext): void {
    const area = ctx.bounds;
    const count = Math.min(40, Math.round(area.w / 90));
    for (let i = 0; i < count; i += 1) {
      const x = area.x + ((i + Math.random()) / count) * area.w;
      const land = ctx.groundAt(x, area.y + rand(0, area.h * 0.7)) ?? ctx.y;
      const sword = this.gfx(x, land - 420, true);
      const len = rand(90, 140);
      sword.fillStyle(0xfff1c8, 0.35).fillRect(-12, -len - 10, 24, len + 20);
      sword.fillStyle(0xffffff, 1).fillTriangle(-6, -len, 6, -len, 0, 0);
      sword.fillStyle(0xe5c78c, 1).fillRect(-16, -len - 6, 32, 6).fillRect(-3, -len - 26, 6, 20);
      sword.setAlpha(0);
      this.scene.tweens.add({
        targets: sword,
        y: land,
        alpha: 1,
        duration: 140,
        delay: rand(0, 180),
        ease: 'Quad.In',
        onComplete: () => {
          this.ring(x, land - 4, 6, 50, 0xfff1c8, 3, 260, 0.35);
          if (i % 3 === 0) this.oneShots.spawn('dust', x, land - 6, { scale: 1.4 });
          this.fade(sword, 260, {}, 260);
        },
      });
    }
    this.targetCuts(ctx, 0xfff1c8);
  }

  /** 隕石天降：整張地圖各處落下隕石，撞地爆炸。 */
  private meteorShower(ctx: SkillFxContext): void {
    const area = ctx.bounds;
    const count = Math.max(4, Math.min(10, Math.round(area.w / 260)));
    for (let i = 0; i < count; i += 1) {
      const x = area.x + ((i + Math.random()) / count) * area.w;
      const land = ctx.groundAt(x, area.y + rand(0, area.h * 0.6)) ?? ctx.y;
      this.fallingMeteor(x - 160, land - 420, x, land - 10, 180 + rand(0, 140), rand(0.9, 1.5), true);
    }
    this.sparks(ctx.targets);
  }

  /** 死神召喚（cue）：前方地面出現法陣與光柱，持續到技能結束。 */
  private summonCircle(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 200;
    const ground = ctx.groundAt(x, ctx.y - 40) ?? ctx.y;
    const circle = this.gfx(x, ground - 4);
    circle.lineStyle(3, 0xb07cff, 0.9).strokeCircle(0, 0, 110).strokeCircle(0, 0, 84);
    const star = [0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.cos((i / 6) * Math.PI * 2) * 84, y: Math.sin((i / 6) * Math.PI * 2) * 84 }));
    circle.lineStyle(2, 0xe0c8ff, 0.9).strokeTriangle(star[0]!.x, star[0]!.y, star[2]!.x, star[2]!.y, star[4]!.x, star[4]!.y);
    circle.strokeTriangle(star[1]!.x, star[1]!.y, star[3]!.x, star[3]!.y, star[5]!.x, star[5]!.y);
    circle.setScale(0.2, 0.07);
    this.scene.tweens.add({ targets: circle, scaleX: 1, scaleY: 0.35, duration: 260, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: circle, angle: 360, duration: 2400, repeat: -1 });
    this.fade(circle, 300, {}, ctx.remainingMs);
    const pillar = this.gfx(x, ground);
    pillar.fillStyle(0x9b6bff, 0.25).fillRect(-70, -420, 140, 420);
    pillar.fillStyle(0xe0c8ff, 0.3).fillRect(-20, -420, 40, 420);
    pillar.setScale(0.2, 1).setAlpha(0);
    this.scene.tweens.add({ targets: pillar, scaleX: 1, alpha: 1, duration: 300 });
    this.fade(pillar, 300, {}, 500);
    this.flash(x, ground - 60, 0xb07cff, 240, 2.2, ctx.remainingMs);
  }

  /** 死神（cue）：巨大的死神從法陣升起，舉著鐮刀，等下一刀時揮出。 */
  private reaper(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 200;
    const ground = ctx.groundAt(x, ctx.y - 40) ?? ctx.y;
    const reaper = this.track(this.scene.add.container(x, ground + 40)).setDepth(DEPTH.fx);
    const v = (px: number, py: number) => new Phaser.Math.Vector2(px, py);
    const body = this.scene.add.graphics();
    // 斗篷（下襬破碎）、兜帽、發光的眼睛
    body.fillStyle(0x1b1030, 0.95).fillPoints([v(-34, -210), v(34, -210), v(80, 0), v(50, -20), v(25, 0), v(0, -24), v(-25, 0), v(-50, -20), v(-80, 0)], true);
    body.fillStyle(0x24163f, 1).fillCircle(0, -220, 40);
    body.fillStyle(0x0a0614, 1).fillCircle(0, -214, 28);
    body.fillStyle(0xff4fd8, 1).fillCircle(-10, -216, 4).fillCircle(10, -216, 4);
    body.lineStyle(3, 0x9b6bff, 0.8).strokeCircle(0, -220, 40);
    const scythe = this.scene.add.graphics();
    scythe.lineStyle(6, 0x6b4a2e, 1).lineBetween(0, 0, 0, -260);
    scythe.fillStyle(0xd8d0ff, 1).fillPoints([v(0, -260), v(-150 * ctx.facing, -230), v(-190 * ctx.facing, -180), v(-120 * ctx.facing, -215)], true);
    scythe.setPosition(60 * ctx.facing, -120).setAngle(-40 * ctx.facing);
    reaper.add([body, scythe]);
    reaper.setAlpha(0).setScale(1.2);
    this.scene.tweens.add({ targets: reaper, y: ground, alpha: 0.95, duration: 380, ease: 'Sine.Out' });
    this.scene.tweens.add({ targets: scythe, angle: 140 * ctx.facing, duration: 200, delay: Math.max(0, ctx.leadMs - 120), ease: 'Quad.In' });
    this.fade(reaper, 260, { y: ground + 30 }, Math.max(0, ctx.remainingMs - 200));
  }

  /** 死神揮鐮：一道橫跨畫面的暗紫弧光，整張地圖的怪身上都出現斬痕。 */
  private reaperSweep(ctx: SkillFxContext): void {
    const view = ctx.view;
    const g = this.gfx(view.x + view.w / 2, ctx.y - 40);
    g.lineStyle(40, 0x6b2fbf, 0.35).beginPath().arc(0, 0, view.w * 0.55, Math.PI * 1.08, Math.PI * 1.92).strokePath();
    g.lineStyle(8, 0xe0c8ff, 0.9).beginPath().arc(0, 0, view.w * 0.55, Math.PI * 1.1, Math.PI * 1.9).strokePath();
    g.setScale(1, 0.5).setAngle(ctx.facing === 1 ? -8 : 8);
    this.fade(g, 360, { angle: ctx.facing === 1 ? 8 : -8 });
    for (const t of ctx.targets) this.xSlash(t.x, t.y, 22, 0x8f5bd6, false);
    this.skyFlash(0x8f5bd6);
  }

  /** 死神爆發：畫面蒙上暗紫，整張地圖的怪身上都炸開。 */
  private darkBurst(ctx: SkillFxContext): void {
    const view = ctx.view;
    const veil = this.gfx(view.x, view.y, false);
    veil.fillStyle(0x2a0f45, 0.45).fillRect(0, 0, view.w, view.h);
    this.fade(veil, 420);
    for (const p of ctx.targets) {
      this.oneShots.spawn('explosion', p.x, p.y, { scale: 1.4, additive: true, tint: 0xb07cff });
      this.ring(p.x, p.y, 6, 46, 0xe0c8ff, 3, 300);
    }
    this.skyFlash(0xb07cff);
  }

  /** 萬箭齊發（cue）：往天上射出一排箭。 */
  private arrowVolley(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 8;
    const y = ctx.y - 34;
    for (let i = 0; i < 11; i += 1) {
      const arrow = this.fxSprite('arrow', x, y);
      if (!arrow) continue;
      const a = -Math.PI / 2 + (i - 5) * 0.12;
      arrow.setRotation(a + Math.PI).setScale(1.3);
      this.fade(arrow, 260, { x: x + Math.cos(a) * 460, y: y + Math.sin(a) * 460 }, i * 15);
    }
    this.skyFlash(0xfff1c8);
  }

  /** 流星神箭（cue）：一支巨大的光箭飛到地圖盡頭，後面拖著火光。 */
  private comet(ctx: SkillFxContext): void {
    const y = ctx.y - CHEST;
    const start = ctx.x + ctx.facing * 20;
    const end = ctx.facing === 1 ? ctx.bounds.x + ctx.bounds.w : ctx.bounds.x;
    const head = this.gfx(start, y);
    head.fillStyle(0xffe08a, 0.35).fillEllipse(0, 0, 180, 56);
    head.fillStyle(0xffffff, 1).fillTriangle(ctx.facing * 70, 0, -ctx.facing * 46, -14, -ctx.facing * 46, 14);
    const duration = 460;
    this.scene.tweens.add({
      targets: head,
      x: end,
      duration,
      onUpdate: () => {
        const ember = this.gfx(head.x - ctx.facing * 40, head.y + rand(-16, 16));
        ember.fillStyle(Math.random() < 0.5 ? 0xffb347 : 0xfff1c8, 0.8).fillCircle(0, 0, rand(5, 12));
        this.fade(ember, 300, { scale: 0.3 });
      },
      onComplete: () => this.fade(head, 120),
    });
    this.flash(start, y, 0xffe08a, 260, 2.6, duration);
    this.skyFlash(0xffe08a);
  }

  /** 流星神箭：每隻被打中的怪身上爆開。 */
  private cometBurst(ctx: SkillFxContext): void {
    for (const t of ctx.targets.slice(0, 12)) this.explosion(t.x, t.y + 10, 1.2, 0xffc060);
    this.sparks(ctx.targets);
  }

  /** 分身飛鏢：一支飛鏢分裂成好幾支大飛鏢，飛到地圖各處的散射點後在原地狂轉，持續到技能結束。 */
  private shurikenStorm(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 14;
    const y = ctx.y - CHEST;
    for (const p of ctx.points) {
      const blade = this.fxSprite('shuriken', x, y);
      if (!blade) continue;
      blade.setScale(3.4).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: blade, x: p.x, y: p.y, duration: 260, ease: 'Sine.Out' });
      this.scene.tweens.add({ targets: blade, angle: 360, duration: 160, repeat: -1 });
      this.fade(blade, 220, { scale: 1 }, ctx.remainingMs);
    }
    this.ring(x, y, 6, 50, 0xbff0ff, 3, 220);
    this.sparks(ctx.targets);
  }

  /** 影分身：從角色身上飛出好幾個影子，衝到地圖各處的散射點，持續到技能結束。 */
  private shadowClones(ctx: SkillFxContext): void {
    if (!ctx.frame) return;
    for (const p of ctx.points) {
      const side: 1 | -1 = p.x >= ctx.x ? 1 : -1;
      const clone = this.afterimage(ctx.frame, ctx.x, ctx.y, side, 0x3a1d66, 0.9, ctx.remainingMs + 200);
      clone.setBlendMode(Phaser.BlendModes.NORMAL);
      this.scene.tweens.add({ targets: clone, x: p.x, y: p.y + 24, duration: 220, ease: 'Quad.Out' });
      const trail = this.gfx(0, 0);
      trail.lineStyle(8, 0x5b3a8c, 0.4).lineBetween(ctx.x, ctx.y - CHEST, p.x, p.y);
      this.fade(trail, 260);
    }
    this.sparks(ctx.targets);
  }

  /** 影分身：每個點上交叉斬。 */
  private cloneSlash(ctx: SkillFxContext): void {
    for (const p of ctx.points) this.xSlash(p.x + rand(-12, 12), p.y + rand(-12, 12), 32, 0x8f5bd6, false);
    this.sparks(ctx.targets);
  }

  /** 散射點上的環（分身飛鏢旋轉中）。 */
  private pointRings(ctx: SkillFxContext, color: number): void {
    for (const p of ctx.points) this.ring(p.x, p.y, 8, 60, color, 2, 180);
    this.sparks(ctx.targets);
  }

  /** 每隻被打中的怪身上一道斬痕（全地圖技能）。 */
  private targetCuts(ctx: SkillFxContext, color: number): void {
    for (const t of ctx.targets.slice(0, 30)) this.cut(t.x, t.y, 28, color);
    this.sparks(ctx.targets);
  }

  // ---------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.add(object);
    object.once(Phaser.GameObjects.Events.DESTROY, () => this.objects.delete(object));
    return object;
  }

  private gfx(x: number, y: number, additive = true): Phaser.GameObjects.Graphics {
    const g = this.track(this.scene.add.graphics({ x, y })).setDepth(DEPTH.fx);
    if (additive) g.setBlendMode(Phaser.BlendModes.ADD);
    return g;
  }

  private fxSprite(id: string, x: number, y: number): Phaser.GameObjects.Sprite | null {
    const asset = this.bundle.fx.get(id);
    if (!asset || !this.scene.textures.exists(asset.path)) return null;
    return this.track(this.scene.add.sprite(x, y, asset.path, frameName(null, 0))).setDepth(DEPTH.fx);
  }

  private fade(object: Phaser.GameObjects.GameObject, duration: number, props: Record<string, number> = {}, delay = 0): void {
    this.scene.tweens.add({ targets: object, alpha: 0, ...props, duration, delay, onComplete: () => object.destroy() });
  }

  private ring(x: number, y: number, from: number, to: number, color: number, width: number, duration: number, squash = 1): void {
    const g = this.gfx(x, y);
    g.lineStyle(width, color, 0.9).strokeCircle(0, 0, from);
    g.setScale(1, squash);
    this.fade(g, duration, { scaleX: to / from, scaleY: (to / from) * squash });
  }

  /** 月牙劍氣：從 x 往前飛 dx，飛完淡出。 */
  private crescent(x: number, y: number, r: number, facing: 1 | -1, dx: number, duration: number, color: number): Phaser.GameObjects.Graphics {
    const g = this.gfx(x, y);
    drawCrescent(g, r, facing, color, 1);
    this.scene.tweens.add({ targets: g, x: x + dx, duration });
    this.fade(g, 160, {}, Math.max(0, duration - 80));
    return g;
  }

  /** 斜的一刀（白芯 + 色光）。 */
  private cut(x: number, y: number, size: number, color: number): void {
    const g = this.gfx(x, y);
    g.lineStyle(3, 0xffffff, 1).lineBetween(-size, size * 0.66, size, -size * 0.66);
    g.lineStyle(9, color, 0.4).lineBetween(-size * 1.1, size * 0.72, size * 1.1, -size * 0.72);
    g.setScale(0.2, 1);
    this.fade(g, 300, { scaleX: 1.2 });
  }

  private xSlash(x: number, y: number, size: number, color: number, light = true): void {
    const g = this.gfx(x, y);
    g.lineStyle(7, color, 0.45).lineBetween(-size, -size, size, size).lineBetween(-size, size, size, -size);
    g.lineStyle(2, 0xffffff, 1).lineBetween(-size * 0.9, -size * 0.9, size * 0.9, size * 0.9).lineBetween(-size * 0.9, size * 0.9, size * 0.9, -size * 0.9);
    g.setScale(0.3);
    this.fade(g, 260, { scale: 1.2 });
    if (light) this.flash(x, y, 0xc59bff, 100, 1.4, 200);
  }

  /** 火球從 (x0,y0) 落到 (x1,y1)，撞地時可以順便爆炸。 */
  private fallingMeteor(x0: number, y0: number, x1: number, y1: number, duration: number, scale: number, explodeOnImpact = false): void {
    const ball = this.gfx(x0, y0);
    ball.fillStyle(0xff7a2a, 0.35).fillCircle(0, 0, 30 * scale);
    ball.fillStyle(0xffb347, 0.8).fillCircle(0, 0, 18 * scale);
    ball.fillStyle(0xfff2c0, 1).fillCircle(0, 0, 9 * scale);
    this.scene.tweens.add({
      targets: ball,
      x: x1,
      y: y1,
      duration,
      ease: 'Quad.In',
      onUpdate: () => {
        if (Math.random() < 0.6) {
          const ember = this.gfx(ball.x + rand(-6, 6), ball.y + rand(-6, 6));
          ember.fillStyle(Math.random() < 0.5 ? 0xff9a40 : 0xffd27a, 0.8).fillCircle(0, 0, rand(4, 9) * scale);
          this.fade(ember, 240, { scale: 0.3 });
        }
      },
      onComplete: () => {
        ball.destroy();
        if (explodeOnImpact) this.explosion(x1, y1 + 10, 1.4 * scale, 0xffa040);
      },
    });
  }

  private bolt(x1: number, y1: number, x2: number, y2: number, color: number, duration: number): void {
    const points = jagged(x1, y1, x2, y2, 9, 14);
    const g = this.gfx(0, 0);
    g.lineStyle(7, color, 0.45).strokePoints(points);
    g.lineStyle(2, 0xffffff, 1).strokePoints(points);
    this.scene.tweens.add({ targets: g, alpha: 0.2, duration: 45, yoyo: true, repeat: 1 });
    this.fade(g, 120, {}, duration - 120);
  }

  private sparks(targets: FxPoint[]): void {
    for (const t of targets.slice(0, 30)) this.oneShots.spawn('hit_spark', t.x + rand(-6, 6), t.y + rand(-6, 6), { additive: true });
  }

  private randomPoints(area: Rect | null, count: number, fallbackY: number): FxPoint[] {
    if (!area) return [];
    return Array.from({ length: count }, () => ({ x: area.x + rand(0, area.w), y: Math.min(fallbackY, area.y + area.h) }));
  }

  /** 光源閃一下（關閉光影或光源太多時略過）。 */
  private flash(x: number, y: number, color: number, radius: number, intensity: number, duration: number): Phaser.GameObjects.Light | null {
    if (!this.lit()) return null;
    const lights = this.scene.lights;
    if (lights.getLightCount() >= 14) return null;
    const light = lights.addLight(x, y, radius, color, intensity);
    this.lights.add(light);
    this.scene.tweens.add({
      targets: light,
      intensity: 0,
      duration,
      onComplete: () => {
        lights.removeLight(light);
        this.lights.delete(light);
      },
    });
    return light;
  }
}

/** 月牙：朝 facing 方向凸出的弧（粗光暈 + 白色刀芯）。 */
function drawCrescent(g: Phaser.GameObjects.Graphics, r: number, facing: 1 | -1, color: number, alpha: number): void {
  const a = facing === 1 ? 0 : Math.PI;
  g.lineStyle(Math.max(8, r * 0.28), color, 0.4 * alpha).beginPath().arc(0, 0, r, a - 1.1, a + 1.1).strokePath();
  g.lineStyle(Math.max(3, r * 0.08), 0xffffff, alpha).beginPath().arc(0, 0, r, a - 0.95, a + 0.95).strokePath();
}

/** 兩點之間的鋸齒線（閃電）。 */
function jagged(x1: number, y1: number, x2: number, y2: number, segments: number, jitter: number): Phaser.Math.Vector2[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const points = [new Phaser.Math.Vector2(x1, y1)];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const offset = rand(-jitter, jitter);
    points.push(new Phaser.Math.Vector2(x1 + (x2 - x1) * t + nx * offset, y1 + (y2 - y1) * t + ny * offset));
  }
  points.push(new Phaser.Math.Vector2(x2, y2));
  return points;
}
