/**
 * 延遲載入遊戲引擎（@lawn/engine → game/engine，含 Phaser）。
 * game/ 尚未 npm install 或引擎有錯時，只有預覽區顯示錯誤，編輯器其他功能照常。
 */
import { useStudio } from './state/studio';

export type Engine = typeof import('@lawn/engine');

let enginePromise: Promise<Engine> | null = null;

export function loadEngine(): Promise<Engine> {
  enginePromise ??= import('@lawn/engine').catch((error: unknown) => {
    enginePromise = null;
    const message = error instanceof Error ? error.message : String(error);
    useStudio.setState({ engineError: message });
    throw new Error(`無法載入遊戲引擎（請確認已在 game/ 執行 npm install）：${message}`);
  });
  return enginePromise;
}
