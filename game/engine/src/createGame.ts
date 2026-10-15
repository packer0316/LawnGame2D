import * as Phaser from 'phaser';
import type { ClassId, MapDef } from '@lawn/shared';
import type { ContentSource } from './content';
import { loadContentBundle } from './content/bundle';
import type { Action } from './core/input';
import type { GameCommand, HudState } from './hud';
import { GameScene } from './scenes/GameScene';

export interface CreateGameOptions {
  content: ContentSource;
  /** 起始房間（1–20）；未指定時從 1 號房開始。 */
  roomId?: number;
  /** 編輯器試玩：直接使用這份地圖，不從 content/ 讀。 */
  mapOverride?: MapDef;
  /** 是否顯示 HUD；編輯器試玩可關掉。預設 true（HUD 由呼叫端用 onHud 自己畫）。 */
  hud?: boolean;
  /** 試玩時按 Esc 會呼叫。 */
  onExit?: () => void;
  /** HUD 狀態（約每 100ms 一次，有變化時也會推）。 */
  onHud?: (state: HudState) => void;
  classId?: ClassId;
  /** 動態光照；預設開。 */
  lighting?: boolean;
  /** 測試用：生怪數量倍率。 */
  spawnScale?: number;
  /** 顯示足場、牆、天花板、繩梯、生怪區。 */
  showColliders?: boolean;
}

export interface GameHandle {
  destroy(): void;
  /** 重新讀取 content/（例如編輯器匯出新素材後）。 */
  reloadContent(): Promise<void>;
  /** HUD 操作。 */
  command(cmd: GameCommand): void;
  /** 觸控按鈕：按下／放開某個動作。 */
  press(action: Action): void;
  release(action: Action): void;
}

/** 內部高度固定 540 像素（SPEC §4.1）。 */
export const INTERNAL_HEIGHT = 540;

declare global {
  interface Window {
    __lawnStats?: () => Record<string, number> | null;
  }
}

export function createGame(parent: HTMLElement, options: CreateGameOptions): GameHandle {
  // 畫布用裝置實際像素渲染，CSS 再縮回來；鏡頭縮放 = 畫布高 ÷ 540（smoothPixelArt）。
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const size = () => ({ w: Math.max(1, Math.round(parent.clientWidth * dpr)), h: Math.max(1, Math.round(parent.clientHeight * dpr)) });
  const initial = size();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: initial.w,
    height: initial.h,
    backgroundColor: '#14121c',
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: { smoothPixelArt: true, maxLights: 16 },
    input: { keyboard: false },
  });

  let scene: GameScene | null = null;
  let destroyed = false;

  const start = async () => {
    const bundle = await loadContentBundle(options.content);
    if (destroyed) return;
    game.scene.add('game', GameScene, true, {
      bundle,
      ...(options.roomId !== undefined ? { roomId: options.roomId } : {}),
      ...(options.mapOverride ? { mapOverride: options.mapOverride } : {}),
      ...(options.classId ? { classId: options.classId } : {}),
      lighting: options.lighting ?? true,
      spawnScale: options.spawnScale ?? 1,
      showColliders: options.showColliders ?? false,
      ...(options.onHud ? { onHud: options.onHud } : {}),
      ...(options.onExit ? { onExit: options.onExit } : {}),
    });
    scene = game.scene.getScene('game') as GameScene;
  };
  start().catch((error: unknown) => {
    console.error(error);
    options.onHud?.({ loading: false, error: error instanceof Error ? error.message : String(error) } as HudState);
  });

  const onResize = () => {
    const next = size();
    game.scale.resize(next.w, next.h);
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(parent);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') options.onExit?.();
  };
  window.addEventListener('keydown', onKeyDown);
  window.__lawnStats = () => scene?.stats() ?? null;

  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      if (window.__lawnStats) delete window.__lawnStats;
      game.destroy(true);
    },
    async reloadContent() {
      if (!scene) return;
      game.scene.remove('game');
      scene = null;
      await start();
    },
    command(cmd) {
      scene?.command(cmd);
    },
    press(action) {
      scene?.press(action);
    },
    release(action) {
      scene?.release(action);
    },
  };
}
