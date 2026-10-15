import type { ClassId } from '@lawn/shared';
import type { InventoryAction, InventorySnapshot } from './inventory/model';
import type { AutoConfig, AutoStatus } from './auto/AutoHunt';

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
  toast?: { id: number; text: string };
  bigWin?: { id: number; level: 'big' | 'mega' | 'super'; amount: number; multiple: number };
  wave?: { phase: 'warning' | 'start'; endsAt?: number };
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
  | { type: 'setBalance'; balance: number }
  | { type: 'toggleDebug' };
