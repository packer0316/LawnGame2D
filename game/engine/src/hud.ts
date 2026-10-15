import type { ClassId } from '@lawn/shared';
import type { AutoConfig, AutoStatus } from './auto/AutoHunt';

export type { AutoConfig, AutoStatus };

/** 開發模式：技能列固定、隨時可按；實際模式：只有普攻 + 常駐小技能，技能列靠打怪掉落、用一次就沒了（SPEC §3.3）。 */
export type GameMode = 'dev' | 'real';

export interface HudSkill {
  id: string;
  name: string;
  icon: string;
  cooldownMs: number;
  totalMs: number;
}

/** 遊戲推給 HUD（React）的狀態。HUD 只顯示，所有操作透過 GameHandle 送回遊戲。 */
export interface HudState {
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
  /** 技能列（鍵盤 1–6）：slot 0 起算，key 是按鍵；只列出有技能的格子。pendingMs > 0 = 掉落技能還在飛進來 */
  skills: (HudSkill & { slot: number; key: string; pendingMs: number; ultimate: boolean })[];
  /** 常駐小技能（X） */
  secondary?: HudSkill;
  /** 剛撿到的技能方塊（畫面座標，CSS 像素）：HUD 播放飛進技能列 slot 的動畫 */
  pickups: { id: number; slot: number; icon: string; name: string; x: number; y: number; flightMs: number }[];
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
  | { type: 'setBet'; bet: number }
  | { type: 'stepBet'; delta: 1 | -1 }
  | { type: 'setClass'; classId: ClassId }
  | { type: 'changeRoom'; roomId: number }
  | { type: 'toggleAuto' }
  | { type: 'setAutoConfig'; config: AutoConfig }
  | { type: 'setMode'; mode: GameMode }
  | { type: 'toggleDebug' };
