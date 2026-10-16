import * as Phaser from 'phaser';
import { PHYSICS, type SkillDef } from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { FxLayer } from '../feel/FxLayer';
import { SkillFx } from '../feel/SkillFx';
import { createClassProjectile, orientSkillWeapon } from '../feel/SkillWeapons';
import { DEPTH } from '../map/MapView';

/** 其他玩家的技能特效有多透明 */
export const REMOTE_FX_ALPHA = 0.5;
const STEP_MS = PHYSICS.dt * 1000;

/**
 * 其他玩家的技能特效（SPEC §5.5）：疊在遊戲場景上面的另一個場景，鏡頭跟著主鏡頭。
 * 特效程式（SkillFx）建立的物件、包括延遲產生的，一出現就收進半透明圖層（Layer 畫每個物件時乘上圖層的透明度），
 * 不用鏡頭透明度：那會先畫到暫存畫布再貼上，疊加發光的特效在某些顯示卡上會變成方塊。也不會動到自己的鏡頭與角色。
 */
export class RemoteFxScene extends Phaser.Scene {
  fx!: FxLayer;
  skillFx!: SkillFx;
  private main!: Phaser.Cameras.Scene2D.Camera;
  private layer!: Phaser.GameObjects.Layer;
  private bundle!: ContentBundle;
  private accumulator = 0;

  constructor() {
    super({ key: 'remote-fx' });
  }

  init(data: { bundle: ContentBundle; main: Phaser.Cameras.Scene2D.Camera }): void {
    this.bundle = data.bundle;
    this.main = data.main;
  }

  create(): void {
    this.layer = this.add.layer().setAlpha(REMOTE_FX_ALPHA);
    // 這個場景之後新增的物件都收進半透明圖層（已經在圖層或容器裡的不動）
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (object: Phaser.GameObjects.GameObject) => {
      if (object !== this.layer && object.displayList === this.sys.displayList) this.layer.add(object);
    });
    this.fx = new FxLayer(this, this.bundle);
    this.skillFx = new SkillFx(this, this.bundle, this.fx, () => false);
    // 主鏡頭在遊戲場景畫完時才是這一幀的位置：這個場景畫之前照抄
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.syncCamera());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.skillFx.clear();
      this.fx.destroy();
    });
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.fx.update(dt, false);
    this.accumulator += dt;
    while (this.accumulator >= STEP_MS) {
      this.skillFx.step(STEP_MS);
      this.accumulator -= STEP_MS;
    }
  }

  /** 投射物（箭、魔法彈、飛鏢）：飛 distance 就消失；有目標時飛到目標就停，呼叫 onHit 播命中。純畫面。 */
  projectile(skill: SkillDef, x: number, y: number, angle: number, distance: number, onHit?: () => void): void {
    const spec = skill.projectile;
    if (!spec) return;
    const asset = this.bundle.fx.get(spec.fx);
    const sprite = createClassProjectile(this, skill, x, y) ?? (asset ? this.add.sprite(x, y, asset.path, '0').setDepth(DEPTH.fx).setScale(spec.scale ?? 1) : null);
    if (!sprite) return;
    orientSkillWeapon(sprite, angle);
    this.tweens.add({
      targets: sprite,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      duration: (distance / Math.max(1, spec.speed)) * 1000,
      onComplete: () => {
        sprite.destroy();
        onHit?.();
      },
    });
  }

  private syncCamera(): void {
    const cam = this.cameras.main;
    const main = this.main;
    if (cam.x !== main.x || cam.y !== main.y || cam.width !== main.width || cam.height !== main.height) cam.setViewport(main.x, main.y, main.width, main.height);
    cam.setZoom(main.zoom);
    cam.setScroll(main.scrollX, main.scrollY);
  }
}
