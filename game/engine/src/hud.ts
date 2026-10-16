import type { ClassId } from '@lawn/shared';
import type { InventoryAction, InventorySnapshot } from './inventory/model';
import type { AutoConfig, AutoStatus } from './auto/AutoHunt';
import type { ComboState } from './feel/ComboTracker';

export type { AutoConfig, AutoStatus };

/** 實際模式：技能依價格扣押注倍數；開發模式：技能每刀只算 1 倍（測試用，SPEC §3.1）。 */
export type GameMode = 'dev' | 'real';

export interface HudSkill {
  id: string;
  name: string;
  icon: string;
  cooldownMs: number;
  totalMs: number;
  /** 放一次（打滿）扣幾倍押注 */
  price: number;
}

/** 遊戲推給 HUD（React）的狀態。HUD 只顯示，所有操作透過 GameHandle 送回遊戲。 */
export interface HudState {
  combo?: ComboState;
  inventory?: InventorySnapshot;
  inventoryOpen?: boolean;
  loading: boolean;
  error?: string;
  balance: number;
  bet: number;
  betLevels: number[];
  betTier: number;
  roomId: number;
  roomName: string;
  rooms: { id: number; name: string; betRange: [number, number]; lineup: string[] }[];
  classId: ClassId;
  classes: { id: ClassId; name: string }[];
  mode: GameMode;
  /** 技能列（鍵盤 1–8）：slot 0 起算，key 是按鍵 */
  skills: (HudSkill & { slot: number; key: string; ultimate: boolean })[];
  /** 常駐小技能（X） */
  secondary?: HudSkill;
  auto: boolean;
  /** 掛機目前在做什麼；paused = 手動介入中 */
  autoStatus?: AutoStatus | 'paused';
  autoConfig: AutoConfig;
  /** 本次掛機：開始到現在的輸贏與時間 */
  autoSession?: { net: number; elapsedMs: number };
  fps: number;
  /** 多人連線：這一房目前的人數（含自己）；單人時沒有 */
  online?: number;
  /** 多人連線的權限被拒絕（畫面上給一個按鈕重新開啟） */
  netDenied?: boolean;
  toast?: { id: number; text: string };
  /** 畫面左側的得獎紀錄：獎金、裝備、卷軸，最新的在最後；每筆 4 秒後消失（大獎不再另外全螢幕顯示） */
  feed?: HudFeedEntry[];
  wave?: { phase: 'warning' | 'start'; endsAt?: number };
}

/** 得獎紀錄一行。 */
export interface HudFeedEntry {
  id: number;
  /** coin = 一般獎金；big／mega／super = 大獎（特殊色）；weapon／scroll = 掉落；warn = 背包已滿等提醒 */
  kind: 'coin' | 'big' | 'mega' | 'super' | 'weapon' | 'scroll' | 'warn';
  text: string;
  /** 獎金（金色數字） */
  amount?: number;
}

export type GameCommand =
  | { type: 'inventoryOpen'; open: boolean }
  | { type: 'inventory'; action: InventoryAction }
  | { type: 'setBet'; bet: number }
  | { type: 'stepBet'; delta: 1 | -1 }
  | { type: 'setClass'; classId: ClassId }
  | { type: 'changeRoom'; roomId: number }
  | { type: 'toggleAuto' }
  | { type: 'setAutoConfig'; config: AutoConfig }
  | { type: 'setMode'; mode: GameMode }
  /** 多人連線被拒絕時：打開平台的權限面板，開啟後重新連線 */
  | { type: 'netPermissions' }
  | { type: 'setBalance'; balance: number }
  | { type: 'toggleDebug' };
