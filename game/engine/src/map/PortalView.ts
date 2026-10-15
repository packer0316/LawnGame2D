import * as Phaser from 'phaser';

const AURA = '__lawn_portal_aura_v1';
const VEIL = '__lawn_portal_veil_v1';
const MINT = 0x8affdc;
const GOLD = 0xeed39a;
const CENTER_Y = -44;

/** 傳送門純視覺：足點固定，大小與光效不參與傳送判定。 */
export class PortalView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly veil: Phaser.GameObjects.Image;
  private readonly ground: Phaser.GameObjects.Image;
  private readonly energy: Phaser.GameObjects.Graphics;
  private readonly light: Phaser.GameObjects.Light | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    depth: number,
    lighting: boolean,
    private readonly phase: number,
  ) {
    PortalView.ensureTextures(scene);
    this.root = scene.add.container(x, y).setDepth(depth).setName('portal-visual');
    this.aura = scene.add.image(0, CENTER_Y, AURA).setDisplaySize(104, 132).setBlendMode(Phaser.BlendModes.ADD);
    this.ground = scene.add.image(0, -1, AURA).setDisplaySize(84, 19).setBlendMode(Phaser.BlendModes.ADD);
    this.veil = scene.add.image(0, CENTER_Y, VEIL).setDisplaySize(44, 78);
    const frame = scene.add.graphics();
    this.energy = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.root.add([this.aura, this.ground, this.veil, frame, this.energy]);

    // 深色底框讓淺色天空前的門環也有輪廓，再疊金屬細邊與青綠內圈。
    frame.lineStyle(5, 0x214d48, 0.85).strokeEllipse(0, CENTER_Y, 54, 88);
    frame.lineStyle(1.5, 0x927c50, 1).strokeEllipse(0, CENTER_Y, 56, 90);
    frame.lineStyle(1.2, GOLD, 0.95).strokeEllipse(0, CENTER_Y, 51, 85);
    frame.lineStyle(1, MINT, 0.85).strokeEllipse(0, CENTER_Y, 45, 79);
    // 冠飾、兩側銜接環與底部細金座，避免只有一個空心橢圓。
    for (const side of [-1, 1]) {
      frame.lineStyle(1, GOLD, 0.8).lineBetween(side * 9, -88, side * 4, -94);
      frame.lineStyle(1, GOLD, 0.8).lineBetween(side * 27, -52, side * 31, -44);
      frame.lineBetween(side * 31, -44, side * 27, -36);
      frame.lineStyle(2, 0x8d885b, 0.9).lineBetween(side * 12, -4, side * 26, -1);
    }
    frame.fillStyle(0x244b45).fillTriangle(0, -99, -4, -92, 4, -92);
    frame.fillStyle(GOLD).fillTriangle(0, -98, -2, -93, 2, -93);
    frame.lineStyle(1, GOLD, 0.65).strokeEllipse(0, -1, 55, 8);
    this.light = lighting ? scene.lights.addLight(x, y - 32, 115, MINT, 0.5) : null;
  }

  /** 只建立兩張共用小貼圖；漸層不需每幀重新上傳。 */
  private static ensureTextures(scene: Phaser.Scene): void {
    if (!scene.textures.exists(AURA)) {
      const texture = scene.textures.createCanvas(AURA, 128, 128)!;
      const ctx = texture.context;
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(113,255,211,0.5)');
      gradient.addColorStop(0.32, 'rgba(75,219,181,0.3)');
      gradient.addColorStop(0.64, 'rgba(48,181,160,0.1)');
      gradient.addColorStop(1, 'rgba(23,106,104,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      texture.refresh();
    }
    if (!scene.textures.exists(VEIL)) {
      const texture = scene.textures.createCanvas(VEIL, 64, 112)!;
      const ctx = texture.context;
      ctx.save();
      ctx.translate(32, 56);
      ctx.scale(1, 1.75);
      const gradient = ctx.createRadialGradient(-4, -5, 0, 0, 0, 32);
      gradient.addColorStop(0, 'rgba(12,65,70,0.5)');
      gradient.addColorStop(0.6, 'rgba(35,141,129,0.4)');
      gradient.addColorStop(0.86, 'rgba(112,255,218,0.65)');
      gradient.addColorStop(1, 'rgba(142,255,226,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(-32, -32, 64, 64);
      ctx.restore();
      texture.refresh();
    }
  }

  update(elapsedMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const visible = this.x + 65 >= view.x && this.x - 65 <= view.right && this.y + 16 >= view.y && this.y - 115 <= view.bottom;
    this.root.setVisible(visible);
    if (!visible) { if (this.light) this.light.intensity = 0; return; }
    const t = elapsedMs / 1000;
    const breath = (Math.sin(t * Math.PI * 2 / 3.2 + this.phase) + 1) / 2;
    // 只縮放柔光，門框和足點保持不動，避免入口跟著呼吸漂移。
    this.aura.setAlpha(0.5 + breath * 0.35).setDisplaySize(100 + breath * 9, 128 + breath * 8);
    this.ground.setAlpha(0.5 + breath * 0.4).setDisplaySize(78 + breath * 10, 17 + breath * 3);
    this.veil.setAlpha(0.65 + breath * 0.25);
    if (this.light) this.light.intensity = 0.35 + breath * 0.3;
    const g = this.energy.clear();
    g.lineStyle(3, MINT, 0.06 + breath * 0.08).strokeEllipse(0, CENTER_Y, 59, 94);
    g.lineStyle(1, 0xd4fff0, 0.4 + breath * 0.3).strokeEllipse(0, CENTER_Y, 45, 79);

    // 緩慢流轉的十二枚短符文，局部亮弧沿內側繞行。
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6 + t * 0.12 + this.phase;
      const x = Math.cos(angle) * 24, y = CENTER_Y + Math.sin(angle) * 41;
      const alpha = 0.35 + 0.3 * (Math.sin(t * 1.5 + i) + 1) / 2;
      g.lineStyle(1, GOLD, alpha).lineBetween(x - Math.cos(angle) * 1.6, y - Math.sin(angle) * 2, x + Math.cos(angle) * 1.6, y + Math.sin(angle) * 2);
      if (i % 3 === 0) g.fillStyle(0xecfff1, alpha).fillCircle(x, y, 1);
    }
    for (let arc = 0; arc < 2; arc++) {
      const start = t * 0.65 + arc * Math.PI + this.phase;
      g.lineStyle(1.5, 0xc8fff0, 0.65).beginPath();
      for (let j = 0; j <= 12; j++) {
        const a = start + j * 0.045, x = Math.cos(a) * 21, y = CENTER_Y + Math.sin(a) * 37;
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }
    // 固定數量的光塵以時間推進，淡入淡出後才循環，沒有瞬間跳點。
    for (let i = 0; i < 14; i++) {
      const progress = (t * (0.14 + i % 3 * 0.025) + i / 14 + this.phase) % 1;
      const alpha = Math.sin(progress * Math.PI) * (0.4 + breath * 0.35);
      const x = Math.sin(i * 2.4 + t * 0.5) * (11 + i % 4 * 5);
      const y = -6 - progress * 89;
      g.fillStyle(MINT, alpha * 0.12).fillCircle(x, y, 3);
      g.fillStyle(i % 3 === 0 ? GOLD : 0xd9fff0, alpha).fillRect(x, y, 1, i % 4 === 0 ? 2 : 1);
    }
    g.fillStyle(0xe6fff2, 0.5 + breath * 0.4).fillCircle(0, -93, 1.3);
  }

  destroy(): void {
    this.root.destroy(true);
    if (this.light) this.scene.lights.removeLight(this.light);
  }
}
