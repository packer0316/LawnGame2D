import * as Phaser from 'phaser';
import { DEPTH } from '../map/MapView';
import { skillIconKey } from '../ui/skillIcons';

interface Cube {
  id: number;
  skillId: string;
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 方塊中心停在這個高度（怪物腳底往上） */
  restY: number;
  ageMs: number;
  resting: boolean;
}

const GRAVITY = 1100;
/** 掉出來到飛去技能列之前，在地上停留展示多久 */
const SHOW_MS = 950;
const HALF = 13;

/**
 * 技能方塊（實際模式的掉落，SPEC §3.3）：從怪物身上彈出、落地彈跳、發光展示，
 * 之後交給 onCollect（場景把它放進技能列，HUD 播放飛進格子的動畫）。
 */
export class SkillDrops {
  private cubes: Cube[] = [];
  private nextId = 1;
  onCollect: (cube: { id: number; skillId: string; x: number; y: number }) => void = () => {};

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(skillId: string, icon: string, x: number, y: number, floorY: number): void {
    const glow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(0xffe7a0, 0.22).fillRoundedRect(-HALF - 6, -HALF - 6, (HALF + 6) * 2, (HALF + 6) * 2, 9);
    glow.fillStyle(0xffe7a0, 0.25).fillRoundedRect(-HALF - 2, -HALF - 2, (HALF + 2) * 2, (HALF + 2) * 2, 7);
    const box = this.scene.add.graphics();
    box.fillStyle(0x15352f, 1).fillRoundedRect(-HALF, -HALF, HALF * 2, HALF * 2, 5);
    box.lineStyle(2, 0xe5c78c, 1).strokeRoundedRect(-HALF, -HALF, HALF * 2, HALF * 2, 5);
    box.fillStyle(0xffffff, 0.12).fillRect(-HALF + 3, -HALF + 3, HALF * 2 - 6, 4);
    const parts: Phaser.GameObjects.GameObject[] = [glow, box];
    if (this.scene.textures.exists(skillIconKey(icon))) parts.push(this.scene.add.image(0, 0, skillIconKey(icon)).setScale(20 / 48));
    const container = this.scene.add.container(x, y, parts).setDepth(DEPTH.fx + 1);
    container.setScale(0.4);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: glow, alpha: 0.35, duration: 380, yoyo: true, repeat: -1 });
    this.cubes.push({ id: this.nextId++, skillId, container, glow, x, y, vx: (Math.random() - 0.5) * 100, vy: -320, restY: floorY - HALF - 3, ageMs: 0, resting: false });
  }

  /** 每個畫面；頓幀時 dtMs = 0。 */
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.cubes = this.cubes.filter((cube) => {
      cube.ageMs += dtMs;
      if (!cube.resting) {
        cube.vy += GRAVITY * dt;
        cube.x += cube.vx * dt;
        cube.y += cube.vy * dt;
        if (cube.y >= cube.restY && cube.vy > 0) {
          cube.y = cube.restY;
          cube.vy = -cube.vy * 0.4;
          cube.vx *= 0.5;
          if (Math.abs(cube.vy) < 60) cube.resting = true;
        }
      }
      // 停住後上下浮動
      const bob = cube.resting ? Math.sin(cube.ageMs / 140) * 2 : 0;
      cube.container.setPosition(Math.round(cube.x), Math.round(cube.y + bob));
      if (cube.ageMs < SHOW_MS) return true;
      this.collect(cube);
      return false;
    });
  }

  /** 換房：還在地上的方塊直接收進技能列。 */
  collectAll(): void {
    for (const cube of this.cubes) this.collect(cube);
    this.cubes = [];
  }

  private collect(cube: Cube): void {
    this.onCollect({ id: cube.id, skillId: cube.skillId, x: cube.x, y: cube.y });
    this.scene.tweens.killTweensOf([cube.container, cube.glow]);
    cube.container.destroy();
  }
}
