import * as Phaser from 'phaser';
import { tagFrameSequence, type AseSheet } from '@lawn/shared';
import type { ContentSource } from '../content';
import type { SheetAsset } from '../content/bundle';

/** Phaser texture 中的 frame 名稱：分層 sheet 是 `{layer}|{index}`，一般 sheet 是 `{index}`。 */
export function frameName(layer: string | null, index: number): string {
  return layer === null ? String(index) : `${layer}|${index}`;
}

/**
 * 用 Phaser Loader 載入圖片（可附法線貼圖），等這幾張完成。
 * 只等自己的圖（貼圖管理器的 addtexture-<key>，有法線貼圖的也是兩張都到才觸發）：背景預載相鄰房間時，
 * 換房不必等預載的其他檔案；同一張已經在下載中（被預載排進去了）就直接等它完成，不會重複下載。
 */
export async function loadImages(scene: Phaser.Scene, source: ContentSource, images: { key: string; path: string; normal?: string }[]): Promise<void> {
  const pending = images.filter((image) => !scene.textures.exists(image.key));
  if (pending.length === 0) return;
  const urls = await Promise.all(
    pending.map(async (image) => ({ key: image.key, url: await source.imageUrl(image.path), normal: image.normal ? await source.imageUrl(image.normal) : undefined })),
  );
  // 等網址期間場景可能已被銷毀（例如預覽元件很快就 destroy）
  if (!isSceneAlive(scene)) return;
  const load = scene.load;
  const textures = scene.textures;
  const done = urls.map(({ key, url, normal }) => new Promise<void>((resolve) => {
    if (textures.exists(key)) return resolve();
    const event = `${Phaser.Textures.Events.ADD_KEY}${key}`;
    const finish = () => {
      textures.off(event, finish);
      load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
      resolve();
    };
    // 載入失敗也結束等待（缺圖顯示成 Phaser 的預設貼圖，不卡住換房）
    const failed = (file: Phaser.Loader.File) => {
      if (file.key === key) finish();
    };
    textures.on(event, finish);
    load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
    load.image(normal ? { key, url, normalMap: normal } : { key, url });
  }));
  // 載入器閒置時才需要 start；正在跑的話新加的檔案會自動排進去
  load.start();
  await Promise.all(done);
}

/** 場景還沒被銷毀（Phaser 銷毀後 sys.game 與 load 會變成 null）。 */
export function isSceneAlive(scene: Phaser.Scene): boolean {
  const sys = scene.sys as Phaser.Scenes.Systems | null | undefined;
  return Boolean(sys?.game && scene.load && scene.textures);
}

/** 把 Aseprite sheet 的每一幀登記成 texture frame（含 --trim 的還原資訊）。 */
export function registerSheetFrames(scene: Phaser.Scene, textureKey: string, sheet: AseSheet): void {
  if (!isSceneAlive(scene)) return;
  const texture = scene.textures.get(textureKey);
  for (const frame of sheet.frames) {
    const name = frameName(frame.layer, frame.index);
    if (texture.has(name)) continue;
    const added = texture.add(name, 0, frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h);
    added?.setTrim(frame.sourceSize.w, frame.sourceSize.h, frame.sourceRect.x, frame.sourceRect.y, frame.sourceRect.w, frame.sourceRect.h);
  }
}

export async function loadSheetAssets(scene: Phaser.Scene, source: ContentSource, assets: SheetAsset[]): Promise<void> {
  assets = [...new Map(assets.map(asset => [asset.path, asset])).values()];
  await loadImages(
    scene,
    source,
    assets.map((asset) => ({ key: asset.path, path: asset.image })),
  );
  for (const asset of assets) registerSheetFrames(scene, asset.path, asset.sheet);
}

/**
 * 依 Aseprite Tag 播放的動畫計時器（不使用 Phaser anims，方便頓幀時整個暫停）。
 * 每幀的長度取 sheet 中該幀的 duration。
 */
export class SheetAnimator {
  private sequence: number[] = [];
  private position = 0;
  private elapsed = 0;
  private loop = true;
  private done = false;
  tag = '';
  speed = 1;
  onComplete: (() => void) | null = null;

  constructor(
    private readonly sheet: AseSheet,
    /** 用來讀 duration 的圖層（一般 sheet 為 null）。 */
    private readonly timingLayer: string | null = null,
    /** 各幀時間覆寫（MonsterDef.frameDurations）：key 是幀號字串。 */
    private readonly overrides: Record<string, number> = {},
  ) {}

  play(tag: string, options: { loop?: boolean; restart?: boolean; onComplete?: () => void } = {}): boolean {
    const info = this.sheet.tags.get(tag);
    if (!info) return false;
    if (tag === this.tag && !options.restart && !this.done) return true;
    this.tag = tag;
    this.sequence = tagFrameSequence(info);
    this.position = 0;
    this.elapsed = 0;
    this.loop = options.loop ?? true;
    this.done = false;
    this.onComplete = options.onComplete ?? null;
    return true;
  }

  /** 目前的時間軸幀號。 */
  get frame(): number {
    return this.sequence[this.position] ?? 0;
  }

  /** 在這個 Tag 內的第幾幀（0 起算）。 */
  get index(): number {
    return this.position;
  }

  get length(): number {
    return this.sequence.length;
  }

  get finished(): boolean {
    return this.done;
  }

  /** 跳到 Tag 內的第 i 幀（預覽用）。 */
  seek(i: number): void {
    this.position = Math.max(0, Math.min(this.sequence.length - 1, i));
    this.elapsed = 0;
  }

  duration(frame: number): number {
    return this.overrides[String(frame)] ?? this.sheet.frame(this.timingLayer, frame)?.durationMs ?? 100;
  }

  update(dtMs: number): void {
    if (this.done || this.sequence.length === 0) return;
    this.elapsed += dtMs * this.speed;
    for (;;) {
      const current = this.duration(this.frame);
      if (this.elapsed < current) break;
      this.elapsed -= current;
      if (this.position + 1 < this.sequence.length) {
        this.position += 1;
      } else if (this.loop) {
        this.position = 0;
      } else {
        this.done = true;
        this.elapsed = 0;
        this.onComplete?.();
        break;
      }
    }
  }
}
