import * as Phaser from 'phaser';
import { FootholdWorld, TILE_FLIP_X, TILE_FLIP_Y, type MapDef, type MapLight, type ThemeDef } from '@lawn/shared';
import type { ContentSource } from '../content';
import { loadImages } from '../render/sheets';
import { PortalView } from './PortalView';
import { drawLandmarkScenery, landmarkFor } from './LandmarkScenery';

/** 畫面層級（SPEC §4.1）。 */
export const DEPTH = {
  background: -100,
  tilesBack: 0,
  monsters: 20,
  player: 30,
  fx: 40,
  tilesFront: 50,
  numbers: 60,
  debug: 90,
} as const;

const hexToInt = (hex: string) => Number.parseInt(hex.slice(1, 7), 16);

function scaleColor(hex: string, intensity: number): number {
  const value = hexToInt(hex);
  const channel = (shift: number) => Math.min(255, Math.round(((value >> shift) & 0xff) * intensity));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

interface BackgroundLayer {
  sprite: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;
  def: ThemeDef['backgrounds'][number];
}

interface LightEntry {
  light: Phaser.GameObjects.Light;
  def: MapLight;
  phase: number;
}

/**
 * 地圖顯示：視差背景、圖塊層、環境光與光源。物理在 @lawn/shared 的 FootholdWorld，這裡只負責畫面。
 */
export class MapView {
  private backgrounds: BackgroundLayer[] = [];
  private lightEntries: LightEntry[] = [];
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private debug: Phaser.GameObjects.Graphics | null = null;
  private scenery: Phaser.GameObjects.Graphics | null = null;
  private motes: Phaser.GameObjects.Graphics | null = null;
  private portals: PortalView[] = [];
  private elapsed = 0;
  lighting = true;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly map: MapDef,
    readonly theme: ThemeDef | undefined,
  ) {}

  /** 載入這張地圖用到的圖片（含法線貼圖）。 */
  static async preload(scene: Phaser.Scene, source: ContentSource, map: MapDef, theme: ThemeDef | undefined): Promise<void> {
    const images: { key: string; path: string; normal?: string }[] = [];
    const normalOf = (path: string) => (theme?.tileset.image === path ? theme.tileset.normal : undefined);
    for (const layer of map.tileLayers) images.push({ key: layer.tileset, path: layer.tileset, normal: normalOf(layer.tileset) });
    for (const bg of theme?.backgrounds ?? []) images.push({ key: bg.image, path: bg.image, normal: bg.normal });
    const unique = new Map(images.map((image) => [image.key, image]));
    await loadImages(scene, source, [...unique.values()]);
  }

  build(options: { lighting: boolean }): void {
    this.lighting = options.lighting;
    const { scene, map, theme } = this;

    // 背景不受點光源影響（太遠），但要跟著主題的環境光變暗，否則暗場景的背景會太亮。
    const ambientTint = theme && this.lighting ? scaleColor(theme.ambient.color, Math.min(1, theme.ambient.intensity * 1.6)) : 0xffffff;
    for (const def of theme?.backgrounds ?? []) {
      const texture = scene.textures.get(def.image);
      const height = texture.getSourceImage().height;
      const sprite = (def.tileX || def.tileY
        ? scene.add.tileSprite(0, 0, 16, height, def.image)
        : scene.add.image(0, 0, def.image))
        .setOrigin(0, 0).setDepth(DEPTH.background + this.backgrounds.length);
      sprite.setTint(ambientTint);
      this.backgrounds.push({ sprite, def });
    }

    const tilemap = scene.make.tilemap({ tileWidth: map.tileSize, tileHeight: map.tileSize, width: Math.ceil(map.size.w / map.tileSize), height: Math.ceil(map.size.h / map.tileSize) });
    this.tilemap = tilemap;
    map.tileLayers.forEach((layerDef, index) => {
      const tileset = tilemap.addTilesetImage(layerDef.tileset, layerDef.tileset, map.tileSize, map.tileSize, 0, 0, 0);
      if (!tileset) return;
      const layer = tilemap.createBlankLayer(`${layerDef.name}_${index}`, tileset);
      if (!layer) return;
      for (const [x, y, tileId, flip] of layerDef.tiles) {
        const tile = layer.putTileAt(tileId, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize));
        if (tile) {
          tile.flipX = (flip & TILE_FLIP_X) !== 0;
          tile.flipY = (flip & TILE_FLIP_Y) !== 0;
        }
      }
      layer.setDepth(layerDef.z === 'front' ? DEPTH.tilesFront : DEPTH.tilesBack);
      if (this.lighting) layer.setLighting(true);
      this.layers.push(layer);
    });

    if (this.lighting) {
      scene.lights.enable();
      scene.lights.setAmbientColor(theme ? scaleColor(theme.ambient.color, theme.ambient.intensity) : 0xffffff);
      for (const def of map.lights) {
        const light = scene.lights.addLight(def.x, def.y, def.radius, hexToInt(def.color), def.intensity);
        this.lightEntries.push({ light, def, phase: Math.random() * 10 });
      }
    }

    scene.cameras.main.setBackgroundColor('#1a1826');
    if (theme?.backgrounds.some((bg) => bg.image.includes('_painted'))) this.buildScenery();
    this.portals = map.portals.filter((p) => p.type !== 'spawn').map((p, i) =>
      new PortalView(scene, p.x, p.y, DEPTH.tilesBack + 3, this.lighting, i * 1.7));
  }

  /** 稀疏蕨葉、花朵與藤蔓，依實際足場擺放，碰撞仍完全由地圖決定。 */
  private buildScenery(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.tilesBack + 1);
    this.scenery = g;
    if (landmarkFor(this.map)) {
      drawLandmarkScenery(g, this.map);
      this.motes = this.scene.add.graphics().setDepth(DEPTH.tilesBack + 2);
      return;
    }
    for (const fh of this.map.footholds) {
      for (let i = 0; i < fh.points.length - 1; i++) {
        const a = fh.points[i]!, b = fh.points[i + 1]!;
        for (let x = a[0] + 24; x < b[0] - 12; x += 31 + Math.abs(Math.floor(x * 17 + a[1])) % 49) {
          const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
          const seed = Math.abs(Math.floor(x * 7 + y * 3));
          const h = 5 + seed % 8;
          g.lineStyle(1, 0x527b64, 1).lineBetween(x, y, x - 2, y - h);
          for (let k = 2; k < h; k += 3) {
            g.fillStyle(k % 2 ? 0x7caa7b : 0x416c58, 1);
            g.fillTriangle(x - 1, y - k + 1, x - 7, y - k - 4, x - 2, y - k - 2);
            g.fillTriangle(x - 1, y - k, x + 5, y - k - 5, x, y - k - 3);
          }
          if (seed % 3 === 0) {
            g.fillStyle(0xe5cf94).fillRect(x - 3, y - h - 2, 3, 3);
            g.fillStyle(0xfff4ce).fillRect(x - 2, y - h - 2, 1, 1);
          }
          if (seed % 4 === 0) {
            for (let k = 0; k < 5; k++) {
              g.lineStyle(1, 0x375c47, 0.8).lineBetween(x + 3, y + k * 4, x + 5 + Math.sin(k) * 3, y + k * 4 + 5);
              g.fillStyle(k % 2 ? 0x60916c : 0x466f54, 0.9).fillEllipse(x + 4 + Math.sin(k) * 3, y + k * 4 + 4, 5, 2);
            }
          }
        }
      }
    }
    this.motes = this.scene.add.graphics().setDepth(DEPTH.tilesBack + 2);
  }

  /** 每幀依鏡頭位置更新視差背景與光源閃爍。 */
  update(dtMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    this.elapsed += dtMs;
    const view = camera.worldView;
    for (const { sprite, def } of this.backgrounds) {
      if (!(sprite instanceof Phaser.GameObjects.TileSprite)) {
        const source = sprite.texture.getSourceImage();
        const scale = Math.max(view.width / source.width, view.height / source.height) * 1.06;
        const width = source.width * scale, height = source.height * scale;
        const progress = Math.max(0, Math.min(1, view.x / Math.max(1, this.map.size.w - view.width)));
        sprite.setDisplaySize(width, height);
        sprite.setPosition(view.x - (width - view.width) * progress, view.y - (height - view.height) * 0.35);
        continue;
      }
      sprite.setPosition(view.x, view.y + def.y - view.y * def.ry);
      sprite.width = view.width + 2;
      sprite.tilePositionX = view.x * def.rx + (def.scrollX ?? 0) * (this.elapsed / 1000);
      if (def.rx === 0 && def.ry === 0) {
        sprite.setPosition(view.x, view.y);
        sprite.height = Math.max(sprite.height, view.height + 2);
      }
    }
    if (this.motes) {
      const g = this.motes.clear(), t = this.elapsed / 1000;
      const landmark = landmarkFor(this.map);
      const petal = landmark?.id === 'jp_fuji';
      const tint = petal ? 0xffc5dc : landmark?.id === 'gr_santorini' ? 0xe7f5ff : 0xffefbe;
      for (let i = 0; i < 30; i++) {
        const x = view.x + ((i * 83.7 + Math.sin(t * 0.25 + i) * 16) % view.width + view.width) % view.width;
        const y = view.y + ((i * 47.3 - t * (1 + i % 3)) % view.height + view.height) % view.height;
        const alpha = 0.15 + (Math.sin(t * 1.4 + i * 2) + 1) * 0.22;
        g.fillStyle(0xf4e7ad, alpha * 0.08).fillCircle(x, y, 5);
        g.fillStyle(tint, alpha).fillRect(x, y, petal ? 3 : i % 4 === 0 ? 2 : 1, petal ? 2 : 1);
      }
    }
    for (const portal of this.portals) portal.update(this.elapsed, camera);
    for (const entry of this.lightEntries) {
      if (entry.def.flicker <= 0) continue;
      const t = this.elapsed / 1000 + entry.phase;
      const wobble = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 23.7) * 0.3 + Math.sin(t * 3.3) * 0.2;
      entry.light.intensity = entry.def.intensity * (1 + wobble * entry.def.flicker);
    }
  }

  /** 足場（綠／黃=單向）、牆（紅）、天花板（橘）、繩梯（藍）、生怪區（紫）；nav 時另畫導航圖。 */
  setDebug(visible: boolean, options: { nav?: boolean } = {}): void {
    this.debug?.destroy();
    this.debug = null;
    if (!visible && !options.nav) return;
    const g = this.scene.add.graphics().setDepth(DEPTH.debug);
    this.debug = g;
    if (options.nav) this.drawNav(g);
    if (!visible) return;
    for (const fh of this.map.footholds) {
      g.lineStyle(1, fh.oneWay ? 0xffe066 : 0x4dff88, 1);
      g.beginPath();
      fh.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.strokePath();
    }
    g.lineStyle(1, 0xff4d4d, 1);
    for (const wall of this.map.walls) g.lineBetween(wall.x, wall.yTop, wall.x, wall.yBottom);
    g.lineStyle(1, 0xffa04d, 1);
    for (const c of this.map.ceilings) g.lineBetween(c.x1, c.y, c.x2, c.y);
    g.lineStyle(2, 0x4db8ff, 1);
    for (const c of this.map.climbables) g.lineBetween(c.x, c.yTop, c.x, c.yBottom);
    g.lineStyle(1, 0xb77bff, 0.6);
    for (const zone of this.map.spawnZones) g.strokeRect(zone.rect.x, zone.rect.y, zone.rect.w, zone.rect.h);
    g.fillStyle(0x6fd3ff, 1);
    for (const portal of this.map.portals) g.fillRect(portal.x - 3, portal.y - 20, 6, 20);
  }

  /** 導航圖：每條邊從起跳點畫到目標足場上最近的點，依類型上色（白=跑、綠=跳、橘=下、藍=爬）。 */
  private drawNav(g: Phaser.GameObjects.Graphics): void {
    const world = new FootholdWorld(this.map);
    const colors: Record<string, number> = { run: 0xffffff, jump: 0x4dff88, drop: 0xffa04d, climb: 0x4db8ff, roll: 0xff7ad9, portal: 0xffe066 };
    const center = (fh: number) => {
      const range = world.footholdRange(fh);
      return range ? (range.x1 + range.x2) / 2 : 0;
    };
    for (const edge of this.map.nav.edges) {
      const fromRange = world.footholdRange(edge.from);
      const toRange = world.footholdRange(edge.to);
      if (!fromRange || !toRange) continue;
      const ax = edge.x ?? center(edge.from);
      const ay = (world.footholdY(edge.from, ax) ?? 0) - 6;
      const bx = Math.max(toRange.x1 + 4, Math.min(toRange.x2 - 4, ax + (edge.dir ?? 0) * 48));
      const by = (world.footholdY(edge.to, bx) ?? 0) - 6;
      g.lineStyle(1, colors[edge.type] ?? 0xffffff, 0.9);
      g.lineBetween(ax, ay, bx, by);
      g.fillStyle(colors[edge.type] ?? 0xffffff, 1);
      g.fillRect(ax - 1, ay - 1, 3, 3);
      g.fillTriangle(bx, by, bx - 3, by - 5, bx + 3, by - 5);
    }
  }

  destroy(): void {
    this.scenery?.destroy();
    this.motes?.destroy();
    for (const portal of this.portals) portal.destroy();
    this.portals = [];
    for (const { sprite } of this.backgrounds) sprite.destroy();
    for (const layer of this.layers) layer.destroy();
    this.tilemap?.destroy();
    for (const { light } of this.lightEntries) this.scene.lights.removeLight(light);
    this.debug?.destroy();
    this.backgrounds = [];
    this.layers = [];
    this.lightEntries = [];
  }
}
