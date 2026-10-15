import { useState } from 'react';
import type { GameCommand, GameMode, HudState } from '@lawn/engine';
import { Icon } from './Icons';

const MODES: { id: GameMode; label: string; detail: string }[] = [
  { id: 'real', label: '實際模式', detail: '每個技能有價格（格子右上角的 ×N）：放一次、每一刀都打滿時共扣 押注 × N，最貴 20 倍。打得少就按比例少扣、揮空不扣；花得多擊殺率越高，返還率一樣是 96%。' },
  { id: 'dev', label: '開發模式', detail: '技能每一刀都只算 1 倍押注（測試技能用）。' },
];

/** 設定金錢的快捷金額。 */
const BALANCE_PRESETS = [1_000, 10_000, 100_000, 1_000_000];

/** 右上角設定（SPEC §2.6）：遊戲模式、持有金幣。 */
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
      <BalanceSetter balance={state.balance} command={command} />
    </div>
  );
}

/** 測試用：直接把持有金幣改成指定金額。輸入框可以打逗號，按 Enter 或「套用」生效；快捷金額點了就生效。 */
function BalanceSetter({ balance, command }: { balance: number; command: (cmd: GameCommand) => void }) {
  const [draft, setDraft] = useState('');
  const amount = Number(draft.replace(/[,\s]/g, ''));
  const valid = draft.trim() !== '' && Number.isSafeInteger(amount) && amount >= 0;
  const apply = (value: number) => {
    command({ type: 'setBalance', balance: value });
    setDraft('');
  };
  return (
    <>
      <span className="settings-label">持有金幣<small>測試用，直接改成指定金額</small></span>
      <div className="balance-setter">
        <input inputMode="numeric" aria-label="持有金幣" placeholder={balance.toLocaleString()} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valid) apply(amount); }} />
        <button disabled={!valid} onClick={() => apply(amount)}>套用</button>
      </div>
      <div className="balance-presets">
        {BALANCE_PRESETS.map((value) => (
          <button key={value} aria-pressed={balance === value} onClick={() => apply(value)}>{value.toLocaleString()}</button>
        ))}
      </div>
    </>
  );
}
