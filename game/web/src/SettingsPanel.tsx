import type { GameCommand, GameMode, HudState } from '@lawn/engine';
import { Icon } from './Icons';

const MODES: { id: GameMode; label: string; detail: string }[] = [
  { id: 'real', label: '實際模式', detail: '只有普攻（Z）與常駐小技能（X）。大技能靠打怪掉落技能方塊，放進技能列，用一次就沒了；自動冒險會自動使用。' },
  { id: 'dev', label: '開發模式', detail: '技能列固定放該職業所有技能，冷卻好就能按（測試技能用）。' },
];

/** 右上角設定（SPEC §2.6）：遊戲模式。 */
export function SettingsPanel({ state, command, onClose }: { state: HudState; command: (cmd: GameCommand) => void; onClose: () => void }) {
  return (
    <div className="panel settings" role="dialog" aria-label="設定">
      <div className="settings-heading">
        <span className="eyebrow">設定</span>
        <button aria-label="關閉設定" onClick={onClose}><Icon name="close" /></button>
      </div>
      <span className="settings-label">遊戲模式</span>
      <div className="mode-options">
        {MODES.map((mode) => (
          <button key={mode.id} aria-pressed={state.mode === mode.id} className={state.mode === mode.id ? 'active' : ''} onClick={() => command({ type: 'setMode', mode: mode.id })}>
            <strong>{mode.label}</strong>
            <small>{mode.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
