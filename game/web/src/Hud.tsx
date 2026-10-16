import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameCommand, HudState, SkillAction, LoadingProgress } from '@lawn/engine';
import { LoadingScreen } from './LoadingScreen';
import { AutoPanel } from './AutoPanel';
import { AutoReportButton, AutoReportPanel } from './AutoReportPanel';
import { Icon } from './Icons';
import { SettingsPanel } from './SettingsPanel';
import { RoomPicker } from './RoomPicker';
import { InventoryPanel } from './InventoryPanel';
import { ComboHud } from './ComboHud';
import { HudAction } from './HudAction';
import { BASIC_SKILL, CLASS_DESCRIPTION, SKILL_DESCRIPTION } from './skillArt';
import { useUiSounds } from './uiSounds';
import { WinFeed } from './WinFeed';
import { BetPicker } from './BetPicker';
import { MobileHud } from './MobileHud';
import { useHudLayout } from './useHudLayout';
import './hud-compact.css';
import './hud-actions.css';
import './mobile-hud.css';

/** 依 SPEC §2.6 的 HUD 配置。HUD 只顯示狀態，所有操作透過 command() 送回遊戲。 */
/** 技能列：第一格是普攻（鍵盤 1），後面固定八格職業技能（鍵盤 2–9），不足八個時後面留空。 */
const HOTBAR_SLOTS = 8;

export function Hud({ state, loading, command, action }: { state: HudState | null; loading?: LoadingProgress | null; command: (cmd: GameCommand) => void; action: (key: 'attack' | SkillAction) => void }) {
  const { preference, change: changeLayout, mobile } = useHudLayout();
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // 掛機收益按鈕對齊「冒險中」、放在操作列上面
  const autoGroupRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const reportButtonRef = useRef<HTMLButtonElement>(null);
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
  const closeReport = useCallback(() => setReportOpen(false), []);
  // 全螢幕（瀏覽器的 Fullscreen API；在 claude.ai 裡可去掉外面的標題列）。不支援的環境按了沒反應
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const closeAll = useCallback(() => {
    setRoomsOpen(false);
    setHelpOpen(false);
    setAutoOpen(false);
    setSettingsOpen(false);
    setBetOpen(false);
    setReportOpen(false);
  }, []);
  const panelOpen = roomsOpen || helpOpen || autoOpen || settingsOpen || betOpen || reportOpen;
  useEffect(() => {
    if (!panelOpen || reportOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, reportOpen, closeAll]);

  if (!state || state.loading || state.error) return <div className="hud"><LoadingScreen progress={loading} error={state?.error} /></div>;

  const roomIndex = state.rooms.findIndex((r) => r.id === state.roomId) + 1;

  return (
    <div className={`hud ${mobile ? 'hud-mobile' : 'hud-desktop'} ${state.autoReport ? 'has-auto-report' : ''}`}>
      {!state.inventoryOpen && <ComboHud combo={state.combo} />}
      {!state.inventoryOpen && <WinFeed entries={state.feed ?? []} />}
      {mobile && panelOpen && <button className="mobile-panel-backdrop" aria-label="關閉面板" onClick={closeAll} />}
      {state.online !== undefined && <div className="net-badge" title="同一房的玩家（含你）"><i />線上 {state.online} 人</div>}
      {state.netDenied && <button className="net-badge net-denied" onClick={() => command({ type: 'netPermissions' })} title="多人連線需要你允許這個頁面的「房間」權限">多人連線未開啟 · 點此開啟</button>}
      {!mobile && <div className="hud-top-left">
        <div className="brand-mark"><Icon name="leaf" /></div>
        <div className="world-title">
          <span className="eyebrow">LAWN / ADVENTURE</span>
          <strong>{state.roomName}</strong>
        </div>
        <button className="room-switch" aria-expanded={roomsOpen} onClick={() => { const open = !roomsOpen; closeAll(); setRoomsOpen(open); }}>
          <Icon name="compass" />尊榮{String(roomIndex).padStart(2, '0')} 換房
        </button>
      </div>}

      {roomsOpen && (
        <RoomPicker state={state} command={command} onClose={() => setRoomsOpen(false)} />
      )}

      <div className="hud-top-right">
        <button className="help-toggle" aria-label="設定" title="設定（遊戲模式）" aria-expanded={settingsOpen} onClick={() => { const open = !settingsOpen; closeAll(); setSettingsOpen(open); }}><Icon name="gear" /></button>
        <button className="help-toggle" aria-label={fullscreen ? '離開全螢幕' : '全螢幕'} title={fullscreen ? '離開全螢幕' : '全螢幕'} data-sfx="ui:toggle" onClick={toggleFullscreen}><Icon name={fullscreen ? 'collapse' : 'expand'} /></button>
        <button className="help-toggle" aria-label="操作說明" aria-expanded={helpOpen} onClick={() => { const open = !helpOpen; closeAll(); setHelpOpen(open); }}><Icon name="help" /></button>
      </div>

      {mobile ? <MobileHud state={state} command={command} action={action} roomsOpen={roomsOpen} betOpen={betOpen} reportOpen={reportOpen}
        onRooms={() => { const open = !roomsOpen; closeAll(); setRoomsOpen(open); }}
        onBet={() => { const open = !betOpen; closeAll(); setBetOpen(open); }} closeBet={closeBet}
        onInventory={() => { closeAll(); command({ type: 'inventoryOpen', open: true }); }}
        onReport={() => { const open = !reportOpen; closeAll(); setReportOpen(open); }}
        onAuto={() => { closeAll(); command({ type: 'toggleAuto' }); }} /> : <div className="hud-bottom-stack">
      <div className="hud-bottom" ref={dockRef}>
        <div className="class-section">
          <span className="eyebrow">冒險職業</span>
          <div className="class-select">
            {state.classes.map((c) => <HudAction key={c.id} art={c.id} label={c.name} description={CLASS_DESCRIPTION[c.id]} aria-pressed={c.id === state.classId} className={c.id === state.classId ? 'active' : ''} details={c.id === state.classId ? '目前職業' : `點擊切換為${c.name}`} onClick={() => command({ type: 'setClass', classId: c.id })}><span>{c.name}</span></HudAction>)}
          </div>
        </div>
        <div className="dock-divider" />
        <div className={`hotbar mode-${state.mode}`} aria-label="技能列">
          <span className="hotbar-mode">{state.mode === 'dev' ? '開發・每刀 1 倍' : '技能押注倍數'}</span>
          <HudAction key={`basic:${state.classId}`} data-slot="basic" className="hotbar-slot basic" art={BASIC_SKILL[state.classId]} label="普攻" description={SKILL_DESCRIPTION[BASIC_SKILL[state.classId]]!} details={<><span>快捷鍵 1 · 按住持續攻擊</span><span>命中時依目前押注結算</span></>} onClick={() => action('attack')}><kbd>1</kbd></HudAction>
          {Array.from({ length: HOTBAR_SLOTS }, (_, slot) => {
            const skill = state.skills.find((s) => s.slot === slot);
            if (!skill) return <div key={slot} data-slot={slot} className="hotbar-slot empty"><kbd>{slot + 2}</kbd></div>;
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
        <div className="dock-divider" />
        <div className="panel bet">
          <div className="bet-heading"><span className="eyebrow">每刀押注</span><span className={`tier tier-${state.betTier}`}>Lv. {state.betTier}</span></div>
          <div className="bet-controls">
            <button aria-label="減少押注" disabled={state.bet <= Math.min(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: -1 })}><Icon name="minus" /></button>
            <button className="value" aria-label="選擇押注" aria-expanded={betOpen} title="點選押注" onClick={() => { const open = !betOpen; closeAll(); setBetOpen(open); }}>{state.bet.toLocaleString()}</button>
            <button aria-label="增加押注" disabled={state.bet >= Math.max(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: 1 })}><Icon name="plus" /></button>
          </div>
          <div className="bet-balance" title="持有金幣"><Icon name="coin" /><span className="label">持有金幣</span><strong>{state.balance.toLocaleString()}</strong></div>
          {betOpen && <BetPicker levels={state.betLevels} bet={state.bet} onPick={(bet) => { command({ type: 'setBet', bet }); setBetOpen(false); }} onClose={closeBet} />}
        </div>
        <div className="adventure-actions" role="group" aria-label="冒險操作">
          <div className="auto-group" data-active={state.auto} ref={autoGroupRef}>
            <button className={`dock-action auto-button ${state.auto ? 'is-on' : ''}`} aria-label="自動冒險" aria-keyshortcuts="A" aria-pressed={state.auto} title={state.auto ? '停止自動冒險 · A' : '開始自動冒險 · A'} onClick={() => command({ type: 'toggleAuto' })}>
              <span className="dock-action-icon"><Icon name={state.auto ? 'pause' : 'play'} /></span>
              <span className="dock-action-title">{state.auto ? '冒險中' : '自動冒險'}</span>
            </button>
            <button className="auto-gear" aria-label="自動冒險設定" title="自動冒險設定" aria-expanded={autoOpen} onClick={() => { const open = !autoOpen; closeAll(); setAutoOpen(open); }}><Icon name="gear" /></button>
          </div>
          <button className="dock-action inventory-open-button" aria-label="開啟背包" aria-keyshortcuts="I" title="背包 · I" aria-expanded={state.inventoryOpen ?? false} onClick={() => { closeAll(); command({ type: 'inventoryOpen', open: true }); }}>
            <span className="dock-action-icon"><Icon name="bag" /></span>
            <span className="dock-action-title">背包</span>
          </button>
        </div>
      </div>
      </div>}

      {!mobile && state.autoReport && <AutoReportButton report={state.autoReport} open={reportOpen} anchor={autoGroupRef} dock={dockRef} buttonRef={reportButtonRef} onClick={() => { const open = !reportOpen; closeAll(); setReportOpen(open); }} />}
      {reportOpen && state.autoReport && <AutoReportPanel report={state.autoReport} buttonRef={reportButtonRef} onClose={closeReport} mobile={mobile} />}
      {!mobile && <div className="hud-footer"><span>← → 移動 <i>·</i> SPACE 跳躍 <i>·</i> SHIFT 翻滾</span><span className="fps">{state.fps} FPS</span></div>}
      {settingsOpen && <SettingsPanel state={state} command={command} layout={preference} mobile={mobile} onLayoutChange={changeLayout} onClose={() => setSettingsOpen(false)}
        onAutoSettings={() => { closeAll(); setAutoOpen(true); }} onReport={() => { closeAll(); setReportOpen(true); }} />}
      {autoOpen && <AutoPanel state={state} command={command} onClose={() => setAutoOpen(false)} />}
      {helpOpen && <div className="panel help" role="dialog" aria-label="操作說明"><div className="settings-heading"><span className="eyebrow">冒險指南</span><button aria-label="關閉操作說明" onClick={() => setHelpOpen(false)}><Icon name="close" /></button></div><h3>操作說明</h3>{mobile ? <><p>點底部技能圖示施放，數字顯示剩餘冷卻。</p><p>右下 AUTO 開關自動移動與戰鬥。</p><p>左下調整押注，點數字選擇金額。</p><p>上方下拉選單切換職業。</p><p>點右下「紀錄」查看掛機時間、輸贏與掉落；自動冒險選項在設定內。</p></> : <><p><kbd>← →</kbd> 移動 <kbd>↑ ↓</kbd> 爬梯／進傳送點</p><p><kbd>Space</kbd> 跳躍 <kbd>↓ Space</kbd> 下跳</p><p><kbd>1</kbd> 普攻（按住連擊） <kbd>2–9</kbd> 技能列</p><p><kbd>Shift</kbd> 翻滾 <kbd>Q E</kbd> 調整押注</p><p><kbd>A</kbd> 自動冒險（點職業圖示切換職業）</p><p><kbd>F1</kbd> 碰撞與導航圖</p></>}<small>命中時扣除押注；揮空不扣款。</small></div>}

      {state.toast && (
        <div key={state.toast.id} className="panel toast">
          {state.toast.text}
        </div>
      )}
      {state.inventoryOpen && state.inventory && <InventoryPanel state={state} command={command} mobile={mobile} />}
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
