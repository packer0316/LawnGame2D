import { useEffect, useState } from 'react';
import type { GameCommand, HudState } from '@lawn/engine';
import { Icon } from './Icons';

const BIG_WIN_TITLE = { big: 'BIG WIN', mega: 'MEGA WIN', super: 'SUPER WIN' } as const;

/** 依 SPEC §2.6 的 HUD 配置。HUD 只顯示狀態，所有操作透過 command() 送回遊戲。 */
export function Hud({ state, command, action }: { state: HudState | null; command: (cmd: GameCommand) => void; action: (key: 'attack' | 'skill1' | 'skill2') => void }) {
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bigWinShown, setBigWinShown] = useState<number | null>(null);

  useEffect(() => {
    if (!state?.bigWin || state.bigWin.id === bigWinShown) return;
    setBigWinShown(state.bigWin.id);
  }, [state?.bigWin, bigWinShown]);

  const [bigWinClosed, setBigWinClosed] = useState<number | null>(null);
  useEffect(() => {
    if (bigWinShown === null) return;
    const timer = setTimeout(() => setBigWinClosed(bigWinShown), 2600);
    return () => clearTimeout(timer);
  }, [bigWinShown]);

  if (!state) return <div className="hud"><div className="loading"><Icon name="leaf" /><span>正在走進森林…</span></div></div>;
  if (state.error) return <div className="hud"><div className="loading error">載入失敗：{state.error}</div></div>;
  if (state.loading) return <div className="hud"><div className="loading">載入中…</div></div>;

  const roomIndex = state.rooms.findIndex((r) => r.id === state.roomId) + 1;
  const showBigWin = state.bigWin && state.bigWin.id === bigWinShown && bigWinClosed !== bigWinShown;

  return (
    <div className="hud">
      <div className="hud-top-left">
        <div className="brand-mark"><Icon name="leaf" /></div>
        <div className="world-title"><span className="eyebrow">LAWN / ADVENTURE</span><strong>{state.roomName}</strong></div>
        <button className="room-switch" aria-expanded={roomsOpen} onClick={() => { setRoomsOpen((open) => !open); setHelpOpen(false); }}><Icon name="compass" /><span>換房</span><span className="room-count">{String(roomIndex).padStart(2, '0')} / {String(state.rooms.length).padStart(2, '0')}</span></button>
      </div>

      {roomsOpen && (
        <div className="panel room-list">
          <div className="room-list-heading"><span className="eyebrow">選擇目的地</span><button aria-label="關閉房間選單" onClick={() => setRoomsOpen(false)}><Icon name="close" /></button></div>
          {state.rooms.map((room, i) => (
            <button
              key={room.id}
              className={room.id === state.roomId ? 'current' : ''}
              onClick={() => {
                setRoomsOpen(false);
                if (room.id !== state.roomId) command({ type: 'changeRoom', roomId: room.id });
              }}
            >
              <span>
                {String(i + 1).padStart(2, '0')} {room.name}
              </span>
              <span className="sub">
                押注 {room.betRange[0]}–{room.betRange[1]}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="hud-top-right">
        <div className="panel balance">
          <Icon name="coin" /><div><span className="label">持有金幣</span><strong>{state.balance.toLocaleString()}</strong></div>
        </div>
        <button className="help-toggle" aria-label="操作說明" aria-expanded={helpOpen} onClick={() => { setHelpOpen(!helpOpen); setRoomsOpen(false); }}><Icon name="help" /></button>
      </div>

      <div className="hud-bottom">
        <div className="class-section">
          <span className="eyebrow">冒險職業</span>
          <div className="class-select">
            {state.classes.map((c, i) => <button key={c.id} title={`${c.name} · ${i + 1}`} aria-label={c.name} aria-pressed={c.id === state.classId} className={c.id === state.classId ? 'active' : ''} onClick={() => command({ type: 'setClass', classId: c.id })}><Icon name={c.id} /><span>{c.name}</span></button>)}
          </div>
        </div>
        <div className="dock-divider" />
        <div className="skills">
          <button className="skill basic" onClick={() => action('attack')} title="普攻 · 按住 Z 連擊"><Icon name={state.classId} /><span>普攻</span><kbd>Z</kbd></button>
          {state.skills.map((skill) => {
            const ratio = skill.totalMs > 0 ? skill.cooldownMs / skill.totalMs : 0;
            return <button key={skill.slot} className={`skill ${skill.slot}`} disabled={ratio > 0} onClick={() => action(skill.slot)}><Icon name={skill.slot === 'skill1' ? 'spark' : state.classId} /><span>{skill.name}</span><kbd>{skill.slot === 'skill1' ? 'X' : 'C'}</kbd>{ratio > 0 && <><div className="cooldown" style={{ transform: `scaleY(${ratio})` }} /><b className="cooldown-number">{Math.ceil(skill.cooldownMs / 1000)}</b></>}</button>;
          })}
        </div>
        <div className="dock-divider" />
        <div className="panel bet">
          <div className="bet-heading"><span className="eyebrow">每刀押注</span><span className={`tier tier-${state.betTier}`}>Lv. {state.betTier}</span></div>
          <div className="bet-controls"><button aria-label="減少押注" disabled={state.bet <= Math.min(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: -1 })}>−</button><span className="value">{state.bet}</span><button aria-label="增加押注" disabled={state.bet >= Math.max(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: 1 })}>+</button></div>
        </div>
        <button className={`auto-button ${state.auto ? 'is-on' : ''}`} aria-pressed={state.auto} onClick={() => command({ type: 'toggleAuto' })}><Icon name={state.auto ? 'pause' : 'play'} /><span>{state.auto ? '冒險中' : '自動冒險'}</span><small>{state.auto ? '點擊暫停' : '即將開放'}</small></button>
      </div>

      <div className="hud-footer"><span>← → 移動 <i>·</i> SPACE 跳躍 <i>·</i> SHIFT 翻滾</span><span className="fps">{state.fps} FPS</span></div>
      {helpOpen && <div className="panel help"><span className="eyebrow">冒險指南</span><h3>操作說明</h3><p><kbd>← →</kbd> 移動 <kbd>↑ ↓</kbd> 爬梯／進傳送點</p><p><kbd>Space</kbd> 跳躍 <kbd>↓ Space</kbd> 下跳</p><p><kbd>Z</kbd> 按住連擊 <kbd>X C</kbd> 技能</p><p><kbd>Shift</kbd> 翻滾 <kbd>Q E</kbd> 調整押注</p><p><kbd>1–4</kbd> 切換職業 <kbd>F1</kbd> 碰撞資訊</p><small>命中時扣除押注；揮空不扣款。</small></div>}

      {state.toast && (
        <div key={state.toast.id} className="panel toast">
          {state.toast.text}
        </div>
      )}

      {showBigWin && state.bigWin && (
        <div className={`big-win ${state.bigWin.level}`} onClick={() => setBigWinClosed(state.bigWin!.id)}>
          <div className="title">{BIG_WIN_TITLE[state.bigWin.level]}</div>
          <div className="amount">+{state.bigWin.amount.toLocaleString()}</div>
          <div className="sub">×{state.bigWin.multiple}</div>
        </div>
      )}
    </div>
  );
}
