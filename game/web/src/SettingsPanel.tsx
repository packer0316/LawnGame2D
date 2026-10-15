import { useEffect, useState } from 'react';
import { sfx, type GameCommand, type GameMode, type HudState, type InventoryAction } from '@lawn/engine';
import { Icon } from './Icons';

const MODES: { id: GameMode; label: string; detail: string }[] = [
  { id: 'real', label: '實際模式', detail: '每個技能有價格（格子右上角的 ×N）：放一次、每一刀都打滿時共扣 押注 × N，最貴 20 倍。打得少就按比例少扣、揮空不扣；花得多擊殺率越高，返還率一樣是 96%。' },
  { id: 'dev', label: '開發模式', detail: '技能每一刀都只算 1 倍押注（測試技能用）。' },
];

/** 設定金錢的快捷金額。 */
const BALANCE_PRESETS = [1_000, 10_000, 100_000, 1_000_000];

/** 右上角設定（SPEC §2.6）：遊戲模式、音效音量、持有金幣。 */
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
      <SfxVolume />
      <BalanceSetter balance={state.balance} command={command} />
      <TestTools state={state} command={command} />
    </div>
  );
}

/** 音效音量（技能、命中、介面；背景音樂另計）。放開滑桿時播一下命中聲試聽。 */
function SfxVolume() {
  const [volume, setVolume] = useState(() => Math.round(sfx.getVolume() * 100));
  return (
    <>
      <span className="settings-label">音效音量<small>{volume === 0 ? '靜音' : `${volume}%`}</small></span>
      <input
        className="sfx-volume"
        type="range"
        min={0}
        max={100}
        step={5}
        value={volume}
        aria-label="音效音量"
        onChange={(e) => {
          const value = Number(e.target.value);
          setVolume(value);
          sfx.setVolume(value / 100);
        }}
        onPointerUp={() => sfx.play('hit:warrior')}
      />
    </>
  );
}

/** 測試工具：獲得所有武器、卷軸各 999、清空重置（要按兩次確認）。結果顯示背包回傳的訊息。 */
function TestTools({ state, command }: { state: HudState; command: (cmd: GameCommand) => void }) {
  const [armed, setArmed] = useState(false);
  /** 按下按鈕時的訊息編號：比它新的才是這裡按出來的結果 */
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  const feedback = state.inventory?.feedback;
  const run = (action: InventoryAction) => {
    setSince(feedback?.id ?? 0);
    command({ type: 'inventory', action });
  };
  return (
    <>
      <span className="settings-label">測試工具</span>
      <div className="test-tools">
        <button onClick={() => run({ type: 'grantAllWeapons' })}>獲得所有武器</button>
        <button onClick={() => run({ type: 'grantScrolls', count: 999 })}>卷軸各 999</button>
        <button
          className={`danger ${armed ? 'armed' : ''}`}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            run({ type: 'reset' });
          }}
        >
          {armed ? '再按一次確定' : '清空重置'}
        </button>
      </div>
      {armed && <small className="test-tools-note">金幣回到 100,000，背包只留四把初始武器、卸下裝備、卷軸各 3 張，無法復原。</small>}
      {!armed && since !== null && feedback && feedback.id > since && <small className={`test-tools-note ${feedback.kind === 'error' ? 'error' : ''}`}>{feedback.message}</small>}
    </>
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
