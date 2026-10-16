import * as Phaser from 'phaser';
import { AVATAR_CANVAS } from '@lawn/shared';
import type { SheetAsset } from '../content/bundle';
import { idleWind } from './idleWind';

/** Deform only the hair/cloth of the existing painting; reuse its atlas and mesh topology. */
export class IdleBody extends Phaser.GameObjects.Mesh2D {
  // Phaser 4.2 implements these methods but omits them from the Mesh2D declarations.
  declare setTint: (color: number) => this;
  declare setTintMode: (mode: number) => this;
  private sourceKey = '';
  private rest: number[] = [];
  private elapsed = 0;
  private outfit: string | null = null;

  constructor(scene: Phaser.Scene) {
    // Atlas metadata is top-down; Mesh2D submits GL UVs bottom-up.
    super(scene, -AVATAR_CANVAS.footX, -AVATAR_CANVAS.footY, '__MISSING', [], [], true);
    this.setOrigin(0, 0).setSize(128, 128).setVisible(false);
  }

  use(asset: SheetAsset, frame: number, outfit: string | null): boolean {
    const f = asset.sheet.frame('body', frame);
    if (!f || f.sourceSize.w !== 128 || f.sourceSize.h !== 128 || asset.sheet.layers.length !== 1) return false;
    const key = `${asset.path}:${frame}`;
    this.outfit = outfit;
    if (this.sourceKey !== key) {
      this.sourceKey = key;
      this.setTexture(asset.path);
      this.setSize(128, 128);
      const source = this.texture.getSourceImage() as HTMLImageElement;
      const { rect, sourceRect } = f;
      const cols = Math.ceil(rect.w / 2), rows = Math.ceil(rect.h / 2);
      this.vertices = []; this.indices = []; this.rest = [];
      for (let row = 0; row <= rows; row++) {
        for (let col = 0; col <= cols; col++) {
          const dx = col / cols * rect.w, dy = row / rows * rect.h;
          const x = sourceRect.x + dx, y = sourceRect.y + dy;
          this.rest.push(x, y);
          this.vertices.push(x, y, (rect.x + dx) / source.width, (rect.y + dy) / source.height);
          if (row < rows && col < cols) {
            const a = row * (cols + 1) + col, b = a + 1, c = a + cols + 1, d = c + 1;
            this.indices.push(a, b, c, 0, b, c, d, 0);
          }
        }
      }
      this.buildOrderedIndices(1); this.setUseOrderedIndices(true);
    }
    this.setVisible(true);
    this.advance(0);
    return true;
  }

  restPose(): void { this.setVisible(false); this.elapsed = 0; }

  advance(dtMs: number): void {
    if (!this.visible) return;
    this.elapsed += Math.max(0, dtMs);
    for (let i = 0; i < this.rest.length; i += 2) {
      const x = this.rest[i]!, y = this.rest[i + 1]!;
      const wind = idleWind(x, y, this.elapsed, this.outfit);
      this.vertices[i * 2] = x + wind.x;
      this.vertices[i * 2 + 1] = y + wind.y;
    }
  }
}
