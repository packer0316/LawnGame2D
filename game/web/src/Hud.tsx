import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameCommand, HudState, SkillAction } from '@lawn/engine';
import { AUTO_STATUS_TEXT, AutoPanel } from './AutoPanel';
import { Icon } from './Icons';
import { SettingsPanel } from './SettingsPanel';
import { RoomPicker } from './RoomPicker';
import { InventoryPanel } from './InventoryPanel';
import { ComboHud } from './ComboHud';
import { HudAction } from './HudAction';
import { BASIC_SKILL, CLASS_DESCRIPTION, SKILL_DESCRIPTION } from './skillArt';
import { useUiSounds } from './uiSounds';

const BIG_WIN_TITLE = { big: 'BIG WIN', mega: 'MEGA WIN', super: 'SUPER WIN' } as const;

/** 依 SPEC §2.6 的 HUD 配置。HUD 只顯示狀態，所有操作透過 command() 送回遊戲。 */
/** 技能列固定八格（鍵盤 1–8），職業技能不足八個時後面留空。 */
const HOTBAR_SLOTS = 8;

export function Hud({ state, command, action }: { state: HudState | null; command: (cmd: GameCommand) => void; action: (key: 'attack' | 'secondary' | SkillAction) => void }) {
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  useUiSounds();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyI' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) return;
      e.preventDefault();
      command({ type: 'inventoryOpen', open: !state?.inventoryOpen });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state?.inventoryOpen, command]);
  const closeBet = useCallback(() => setBetOpen(false), []);
  const closeAll = () => {
    setRoomsOpen(false);
    setHelpOpen(false);
    setAutoOpen(false);
    setSettingsOpen(false);
    setBetOpen(false);
  };
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
      {!state.inventoryOpen && <ComboHud combo={state.combo} />}
      <div className="hud-top-left">
        <div className="brand-mark"><Icon name="leaf" /></div>
        <div className="world-title"><span className="eyebrow">LAWN / ADVENTURE</span><strong>{state.roomName}</strong></div>
        <button className="room-switch" aria-expanded={roomsOpen} onClick={() => { const open = !roomsOpen; closeAll(); setRoomsOpen(open); }}><Icon name="compass" /><span>換房</span><span className="room-count">{String(roomIndex).padStart(2, '0')} / {String(state.rooms.length).padStart(2, '0')}</span></button>
      </div>

      {roomsOpen && (
        <RoomPicker state={state} command={command} onClose={() => setRoomsOpen(false)} />
      )}

      <div className="hud-top-right">
        <button className="help-toggle" aria-label="設定" title="設定（遊戲模式）" aria-expanded={settingsOpen} onClick={() => { const open = !settingsOpen; closeAll(); setSettingsOpen(open); }}><Icon name="gear" /></button>
        <button className="help-toggle" aria-label="操作說明" aria-expanded={helpOpen} onClick={() => { const open = !helpOpen; closeAll(); setHelpOpen(open); }}><Icon name="help" /></button>
      </div>

      <div className="hud-bottom-stack">
      <div className={`hotbar mode-${state.mode}`} aria-label="技能列">
        <span className="hotbar-mode">{state.mode === 'dev' ? '開發・每刀 1 倍' : '技能押注倍數'}</span>
        {Array.from({ length: HOTBAR_SLOTS }, (_, slot) => {
          const skill = state.skills.find((s) => s.slot === slot);
          if (!skill) return <div key={slot} data-slot={slot} className="hotbar-slot empty"><kbd>{slot + 1}</kbd></div>;
          const ratio = skill.totalMs > 0 ? skill.cooldownMs / skill.totalMs : 0;
          const classes = ['hotbar-slot', ratio > 0 ? 'cooling' : '', skill.ultimate ? 'ultimate' : ''].filter(Boolean).join(' ');
          return (
            <HudAction key={`${slot}:${skill.id}`} data-slot={slot} className={classes} art={skill.id} label={skill.name}
              description={SKILL_DESCRIPTION[skill.id] ?? '施放職業專屬技能。'} disabled={ratio > 0}
              details={<SkillDetails skill={skill} hotkey={skill.key} state={state} />} onClick={() => action(`skill${slot + 1}` as SkillAction)}>
              <kbd>{skill.key}</kbd>
              {ratio > 0 && <><div className="cooldown" style={{ transform: `scaleY(${ratio})` }} /><b className="cooldown-number">{Math.ceil(skill.cooldownMs / 1000)}</b></>}
            </HudAction>
          );
        })}
      </div>
      <div className="hud-bottom">
        <div className="class-section">
          <span className="eyebrow">冒險職業</span>
          <div className="class-select">
            {state.classes.map((c) => <HudAction key={c.id} art={c.id} label={c.name} description={CLASS_DESCRIPTION[c.id]} aria-pressed={c.id === state.classId} className={c.id === state.classId ? 'active' : ''} details={c.id === state.classId ? '目前職業' : `點擊切換為${c.name}`} onClick={() => command({ type: 'setClass', classId: c.id })}><span>{c.name}</span></HudAction>)}
          </div>
        </div>
        <div className="dock-divider" />
        <div className="skills">
          <HudAction key={`basic:${state.classId}`} className="skill basic" art={BASIC_SKILL[state.classId]} label="普攻" description={SKILL_DESCRIPTION[BASIC_SKILL[state.classId]]!} details={<><span>快捷鍵 Z · 按住持續攻擊</span><span>命中時依目前押注結算</span></>} onClick={() => action('attack')}><kbd>Z</kbd></HudAction>
          {state.secondary && (() => {
            const s = state.secondary;
            const ratio = s.totalMs > 0 ? s.cooldownMs / s.totalMs : 0;
            return <HudAction key={`secondary:${s.id}`} className="skill secondary" art={s.id} label={s.name} description={SKILL_DESCRIPTION[s.id] ?? '施放常駐技能。'} disabled={ratio > 0} details={<SkillDetails skill={s} hotkey="X" state={state} />} onClick={() => action('secondary')}><kbd>X</kbd>{ratio > 0 && <><div className="cooldown" style={{ transform: `scaleY(${ratio})` }} /><b className="cooldown-number">{Math.ceil(s.cooldownMs / 1000)}</b></>}</HudAction>;
          })()}
        </div>
        <div className="dock-divider" />
        <div className="panel bet">
          <div className="bet-heading"><span className="eyebrow">每刀押注</span><span className={`tier tier-${state.betTier}`}>Lv. {state.betTier}</span></div>
          <div className="bet-controls">
            <button aria-label="減少押注" disabled={state.bet <= Math.min(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: -1 })}>−</button>
            <button className="value" aria-label="選擇押注" aria-expanded={betOpen} title="點選押注" onClick={() => { const open = !betOpen; closeAll(); setBetOpen(open); }}>{state.bet.toLocaleString()}</button>
            <button aria-label="增加押注" disabled={state.bet >= Math.max(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: 1 })}>+</button>
          </div>
          <div className="bet-balance" title="持有金幣"><Icon name="coin" /><span className="label">持有金幣</span><strong>{state.balance.toLocaleString()}</strong></div>
          {betOpen && <BetPicker levels={state.betLevels} bet={state.bet} onPick={(bet) => { command({ type: 'setBet', bet }); setBetOpen(false); }} onClose={closeBet} />}
        </div>
        <div className="auto-group">
          <button className={`auto-button ${state.auto ? 'is-on' : ''}`} aria-pressed={state.auto} title="自動冒險 · A" onClick={() => command({ type: 'toggleAuto' })}><Icon name={state.auto ? 'pause' : 'play'} /><span>{state.auto ? '冒險中' : '自動冒險'}</span><small>{state.auto ? AUTO_STATUS_TEXT[state.autoStatus ?? 'search'] : '按 A 開始'}</small></button>
          <button className="auto-gear" aria-label="自動冒險設定" aria-expanded={autoOpen} onClick={() => { const open = !autoOpen; closeAll(); setAutoOpen(open); }}><Icon name="gear" /></button>
        </div>
        <button className="inventory-open-button" aria-label="開啟背包" title="背包 · I" aria-expanded={state.inventoryOpen ?? false} onClick={() => { closeAll(); command({ type: 'inventoryOpen', open: true }); }}><Icon name="bag" /><span>背包</span><small>按 I 開啟</small></button>
      </div>
      </div>

      <div className="hud-footer"><span>← → 移動 <i>·</i> SPACE 跳躍 <i>·</i> SHIFT 翻滾</span><span className="fps">{state.fps} FPS</span></div>
      {settingsOpen && <SettingsPanel state={state} command={command} onClose={() => setSettingsOpen(false)} />}
      {autoOpen && <AutoPanel state={state} command={command} onClose={() => setAutoOpen(false)} />}
      {helpOpen && <div className="panel help"><span className="eyebrow">冒險指南</span><h3>操作說明</h3><p><kbd>← →</kbd> 移動 <kbd>↑ ↓</kbd> 爬梯／進傳送點</p><p><kbd>Space</kbd> 跳躍 <kbd>↓ Space</kbd> 下跳</p><p><kbd>Z</kbd> 按住連擊 <kbd>X</kbd> 小技能 <kbd>1–6</kbd> 技能列</p><p><kbd>Shift</kbd> 翻滾 <kbd>Q E</kbd> 調整押注</p><p><kbd>A</kbd> 自動冒險（點職業圖示切換職業）</p><p><kbd>F1</kbd> 碰撞與導航圖</p><small>命中時扣除押注；揮空不扣款。</small></div>}

      {state.toast && (
        <div key={state.toast.id} className="panel toast">
          {state.toast.text}
        </div>
      )}
      {state.inventoryOpen && state.inventory && <InventoryPanel state={state} command={command} />}

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

function SkillDetails({ skill, hotkey, state }: { skill: NonNullable<HudState['secondary']>; hotkey: string; state: HudState }) {
  return <>
    <span>快捷鍵 {hotkey} · 冷卻 {skill.totalMs / 1000} 秒</span>
    <span>{state.mode === 'dev' ? '開發模式：每刀 1 倍押注' : `施放打滿最多 ${skill.price} 倍押注（${(skill.price * state.bet).toLocaleString()} 金幣）`}</span>
    {skill.cooldownMs > 0 && <span className="tip-status">冷卻中 · 剩餘 {Math.ceil(skill.cooldownMs / 1000)} 秒</span>}
  </>;
}

/** 押注清單：從押注數字往上展開，打開時目前押注置中；底下 MIN／MAX。點清單外面或按 Esc 關閉。 */
function BetPicker({ levels, bet, onPick, onClose }: { levels: number[]; bet: number; onPick: (bet: number) => void; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('.current');
    if (list && current) list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
  }, []);
  useEffect(() => {
    // 押注數字本身在 .panel.bet 裡，點它由按鈕自己切換開關
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.panel.bet')) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const min = levels[0];
  const max = levels.at(-1);
  return (
    <div className="panel bet-picker">
      <div className="bet-picker-list" ref={listRef} role="listbox" aria-label="每刀押注">
        {levels.map((level) => (
          <button key={level} role="option" aria-selected={level === bet} className={level === bet ? 'current' : ''} onClick={() => onPick(level)}>
            {level.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="bet-picker-ends">
        <button disabled={min === undefined || bet === min} onClick={() => min !== undefined && onPick(min)}>MIN</button>
        <button disabled={max === undefined || bet === max} onClick={() => max !== undefined && onPick(max)}>MAX</button>
      </div>
    </div>
  );
}
