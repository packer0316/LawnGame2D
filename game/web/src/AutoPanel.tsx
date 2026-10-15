import { AUTO_ROOM, type AutoConfig, type AutoStatus, type GameCommand, type HudState } from '@lawn/engine';
import { Icon } from './Icons';

const STRATEGIES: { id: AutoConfig['strategy']; label: string; hint: string }[] = [
  { id: 'nearest', label: '最近', hint: '以距離為主，順路打怪多的一群' },
  { id: 'highest', label: '最高倍率', hint: '往高倍率的怪走' },
  { id: 'densest', label: '最密集', hint: '往怪最多的地方走，站在打得到最多隻的位置' },
];

const STOPS: { key: keyof AutoConfig['stop']; label: string; unit: string }[] = [
  { key: 'balanceBelow', label: '餘額低於', unit: '金幣' },
  { key: 'lossAtLeast', label: '累計輸達', unit: '金幣' },
  { key: 'winAtLeast', label: '累計贏達', unit: '金幣' },
  { key: 'payoutMultipleAtLeast', label: '單次派彩達', unit: '倍' },
  { key: 'minutes', label: '掛機時間', unit: '分鐘' },
];

export const AUTO_STATUS_TEXT: Record<AutoStatus | 'paused', string> = {
  search: '尋找目標',
  travel: '移動中',
  attack: '戰鬥中',
  portal: '前往下一房',
  paused: '手動操作中',
};

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 自動冒險設定（SPEC §3.6）：選怪策略、自動技能、自動換房、停止條件。 */
export function AutoPanel({ state, command, onClose }: { state: HudState; command: (cmd: GameCommand) => void; onClose: () => void }) {
  const config = state.autoConfig;
  const set = (patch: Partial<AutoConfig>) => command({ type: 'setAutoConfig', config: { ...config, ...patch } });
  const setStop = (key: keyof AutoConfig['stop'], raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    set({ stop: { ...config.stop, [key]: value } });
  };
  const session = state.autoSession;

  return (
    <div className="panel auto-settings" role="dialog" aria-label="自動冒險設定">
      <div className="auto-settings-heading">
        <span className="eyebrow">自動冒險設定</span>
        <button aria-label="關閉設定" onClick={onClose}><Icon name="close" /></button>
      </div>

      {state.auto && session && (
        <div className="auto-session">
          <span>{AUTO_STATUS_TEXT[state.autoStatus ?? 'search']}</span>
          <span className={session.net >= 0 ? 'win' : 'loss'}>{session.net >= 0 ? '+' : ''}{session.net.toLocaleString()}</span>
          <span>{formatDuration(session.elapsedMs)}</span>
        </div>
      )}

      <div className="auto-row">
        <span className="auto-label">選怪策略</span>
        <div className="segmented">
          {STRATEGIES.map((s) => <button key={s.id} title={s.hint} aria-pressed={config.strategy === s.id} className={config.strategy === s.id ? 'active' : ''} onClick={() => set({ strategy: s.id })}>{s.label}</button>)}
        </div>
      </div>
      <label className="auto-row toggle">
        <span className="auto-label">冷卻好就放技能</span>
        <input type="checkbox" checked={config.useSkills} onChange={(e) => set({ useSkills: e.target.checked })} />
      </label>
      <label className="auto-row toggle">
        <span className="auto-label">怪少時自動前往下一房<small>走得到的怪少於 {AUTO_ROOM.minMobs} 隻持續 {AUTO_ROOM.afterMs / 1000} 秒</small></span>
        <input type="checkbox" checked={config.autoRoom} onChange={(e) => set({ autoRoom: e.target.checked })} />
      </label>

      <span className="eyebrow auto-stop-title">停止條件（空白 = 不限）</span>
      <div className="auto-stops">
        {STOPS.map((s) => (
          <label key={s.key}>
            <span>{s.label}</span>
            <input type="number" min={0} inputMode="numeric" placeholder="不限" value={config.stop[s.key] ?? ''} onChange={(e) => setStop(s.key, e.target.value)} />
            <small>{s.unit}</small>
          </label>
        ))}
      </div>
      <small className="auto-note">按任何移動或攻擊鍵會暫停自動，放開 3 秒後繼續。</small>
    </div>
  );
}
