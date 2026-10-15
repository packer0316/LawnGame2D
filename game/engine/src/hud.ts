import type { ClassId } from '@lawn/shared';

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
  skills: { slot: 'skill1' | 'skill2'; id: string; name: string; cooldownMs: number; totalMs: number }[];
  auto: boolean;
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
  | { type: 'toggleDebug' };
