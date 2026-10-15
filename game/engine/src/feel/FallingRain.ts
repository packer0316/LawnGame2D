import * as Phaser from 'phaser';
import { DEPTH } from '../map/MapView';
import { atlasKey, type SkillAtlasName } from './SkillAtlas';
import { rainQuad, type RainSurface } from './RainGeometry';

export interface FallingRainOptions {
  kind: 'sword' | 'arrow'; x: number; top: number; exitY: number;
  surface: RainSurface | null; height: number; delay: number; embedRatio: number;
  /** Arrival on the player's fixed skill clock; land() confirms the strike. */
  impactAtMs?: number;
}

/** One owner for the fall, impact, embed and dissolve clocks; no delayed orphan FX.
 * WebGL Mesh2D clips the blade at the real surface, including slopes. Unlike a
 * mask filter this needs no per-blade render target and batches with normal art.
 */
export class FallingRain {
  readonly weapon: Phaser.GameObjects.Mesh2D;
  private impact: Phaser.GameObjects.Mesh2D | null = null;
  private readonly clock = { elapsed: 0 };
  private readonly fallMs: number;
  private readonly embedMs: number;
  private readonly holdMs: number;
  private readonly fadeMs = 240;
  private readonly impactMs: number;
  private readonly duration: number;
  private dead = false;
  private contacted = false;
  private awaitingImpact: boolean;

  constructor(private readonly scene: Phaser.Scene, readonly options: FallingRainOptions, private readonly onDone: () => void) {
    const heavy = options.kind === 'sword';
    const travelMs = (heavy ? 440 : 330) + Math.min(180, Math.max(0, (options.surface?.y ?? options.exitY) - options.top - 250) * .28);
    this.fallMs = options.impactAtMs === undefined ? travelMs : Math.min(travelMs, heavy ? 500 : 370, options.impactAtMs);
    const delay = options.impactAtMs === undefined ? options.delay : options.impactAtMs - this.fallMs;
    this.clock.elapsed = -delay;
    this.awaitingImpact = options.impactAtMs !== undefined;
    this.embedMs = heavy ? 170 : 115;
    this.holdMs = heavy ? 330 : 190;
    this.impactMs = heavy ? 590 : 400;
    this.duration = this.fallMs + (options.surface ? this.embedMs + this.holdMs + this.fadeMs : 0);
    this.weapon = this.mesh(heavy ? 'swordFall' : 'arrowFall', options.x, options.top);
    this.weapon.setAlpha(0);
    this.draw(this.weapon, 0, options.height, heavy ? .975 : .93, null);
  }

  get count(): number { return this.dead ? 0 : 1 + (this.impact ? 1 : 0); }

  /** Same fixed clock as Player: hit-stop, slow motion and inventory pause agree. */
  step(dt: number): void {
    if (this.dead) return;
    this.clock.elapsed += dt;
    if (this.clock.elapsed < 0) return;
    if (!this.awaitingImpact && this.clock.elapsed >= this.duration) { this.destroy(); return; }
    this.render();
  }

  land(): void {
    if (this.dead || !this.awaitingImpact) return;
    this.awaitingImpact = false;
    this.clock.elapsed = this.fallMs;
    this.render();
  }

  private mesh(name: SkillAtlasName, x: number, y: number): Phaser.GameObjects.Mesh2D {
    const mesh = new Phaser.GameObjects.Mesh2D(this.scene, x, y, atlasKey(name), [], []);
    mesh.setOrigin(0, 0).setDepth(DEPTH.fx);
    this.scene.add.existing(mesh);
    return mesh;
  }

  private draw(mesh: Phaser.GameObjects.Mesh2D, frameIndex: number, height: number, origin: number, surface: RainSurface | null): void {
    const frame = mesh.texture.get(frameIndex);
    // Mesh UVs must use actual atlas rectangles (including odd image dimensions).
    const polygon = rainQuad(height * frame.width / frame.height, height, origin, mesh.y, surface);
    mesh.vertices = polygon.flatMap(p => [p.x, p.y, frame.u0 + (frame.u1 - frame.u0) * p.u, frame.v0 + (frame.v1 - frame.v0) * p.v]);
    const indexCount = Math.max(0, polygon.length - 2) * 4;
    if (mesh.indices.length !== indexCount) {
      mesh.indices = [];
      for (let i = 1; i + 1 < polygon.length; i++) mesh.indices.push(0, i, i + 1, 0);
      mesh.buildOrderedIndices(1, true);
    }
    mesh.setSize(height * frame.width / frame.height, height).setOrigin(0, 0);
    // Stable tiny polygons (usually a quad) keep the regular quad batch path.
    mesh.setData('rainFrame', frameIndex);
  }

  private render(): void {
    if (this.dead) return;
    const o = this.options, heavy = o.kind === 'sword';
    // Numerical drift must never trigger an impact before onStrike/applyHits.
    const elapsed = this.awaitingImpact ? Math.min(this.clock.elapsed, this.fallMs - .001) : this.clock.elapsed;
    const land = o.surface?.y ?? o.exitY, fall = Math.min(1, elapsed / this.fallMs);
    const after = Math.max(0, elapsed - this.fallMs);
    const embed = Math.min(1, after / this.embedMs);
    const depth = o.surface ? o.height * o.embedRatio * (1 - (1 - embed) ** 3) : 0;
    this.weapon.y = o.top + (land - o.top) * fall ** 2 + depth;
    this.weapon.alpha = Math.min(1, elapsed / 60) * (1 - Phaser.Math.Clamp((after - this.embedMs - this.holdMs) / this.fadeMs, 0, 1));
    this.weapon.setData('rainPhase', fall < 1 ? 'fall' : embed < 1 ? 'embed' : after < this.embedMs + this.holdMs ? 'hold' : 'dissolve');
    // The full fall sequence resolves into the final intact blade at contact.
    this.draw(this.weapon, Math.min(7, Math.floor(fall * 8)), o.height, heavy ? .975 : .93, o.surface);
    if (fall < 1 || !o.surface) return;
    if (!this.contacted) {
      this.contacted = true;
      this.impact = this.mesh(heavy ? 'swordGround' : 'arrowGround', o.x, land);
      this.impact.setDepth(DEPTH.fx + 1);
    }
    if (this.impact) {
      if (after >= this.impactMs) { this.impact.destroy(); this.impact = null; }
      else {
        const frame = Math.min(7, Math.floor(after / this.impactMs * 8));
        const baseline = heavy ? (frame < 4 ? .78 : .70) : .70;
        this.draw(this.impact, frame, heavy ? 180 : 116, baseline, o.surface);
        this.impact.alpha = Math.min(1, (this.impactMs - after) / 100);
      }
    }
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.weapon.destroy(); this.impact?.destroy(); this.impact = null;
    this.onDone();
  }
}
