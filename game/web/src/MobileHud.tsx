import type { CSSProperties } from 'react';
import type { GameCommand, HudState, SkillAction } from '@lawn/engine';
import type { ClassId } from '@lawn/shared';
import { BetPicker } from './BetPicker';
import { Icon } from './Icons';
import { PixelIcon } from './PixelIcon';
import { BASIC_SKILL } from './skillArt';

/** 手機博奕介面：技能一排，財產與押注常駐，主要操作靠右。 */
export function MobileHud({ state, command, action, roomsOpen, betOpen, reportOpen, onRooms, onBet, closeBet, onInventory, onAuto, onReport }: {
  state: HudState;
  command: (cmd: GameCommand) => void;
  action: (key: 'attack' | SkillAction) => void;
  roomsOpen: boolean; betOpen: boolean; reportOpen: boolean;
  onRooms: () => void; onBet: () => void; closeBet: () => void;
  onInventory: () => void; onAuto: () => void; onReport: () => void;
}) {
  const roomIndex = state.rooms.findIndex(room => room.id === state.roomId) + 1;
  return <>
    <div className="mobile-location">
      <button className="mobile-room" aria-label="切換房間" aria-expanded={roomsOpen} onClick={onRooms}><Icon name="compass" /><span>{String(roomIndex).padStart(2, '0')} · {state.roomName}</span></button>
      <label className="mobile-class">
        <PixelIcon id={state.classId} />
        <select aria-label="職業" value={state.classId} onChange={event => command({ type: 'setClass', classId: event.target.value as ClassId })}>
          {state.classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Icon name="chevronDown" />
      </label>
    </div>

    <div className="mobile-bottom-bar" style={{ '--mobile-skill-count': state.skills.length + 1 } as CSSProperties}>
      <div className="panel bet mobile-finance" aria-label="押注與財產">
        <div className="mobile-wallet" aria-label={`持有金幣 ${state.balance.toLocaleString()}`}><Icon name="coin" /><strong>{state.balance.toLocaleString()}</strong></div>
        <div className="bet-controls">
          <button aria-label="減少押注" disabled={state.bet <= Math.min(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: -1 })}><Icon name="minus" /></button>
          <button className="value" aria-label="選擇押注" aria-expanded={betOpen} onClick={onBet}><small>BET</small><strong>{state.bet.toLocaleString()}</strong></button>
          <button aria-label="增加押注" disabled={state.bet >= Math.max(...state.betLevels)} onClick={() => command({ type: 'stepBet', delta: 1 })}><Icon name="plus" /></button>
        </div>
        {betOpen && <BetPicker levels={state.betLevels} bet={state.bet} onPick={bet => { command({ type: 'setBet', bet }); closeBet(); }} onClose={closeBet} />}
      </div>

      <div className="mobile-skills" role="group" aria-label="技能列">
        <button className="mobile-skill basic" aria-label="普攻" title="普攻" data-sfx="none" onClick={() => action('attack')}><PixelIcon id={BASIC_SKILL[state.classId]} /></button>
        {state.skills.map(skill => {
          const cooling = skill.cooldownMs > 0;
          const ratio = skill.totalMs > 0 ? skill.cooldownMs / skill.totalMs : 0;
          return <button key={skill.id} className={`mobile-skill ${skill.ultimate ? 'ultimate' : ''}`} aria-label={`${skill.name}${cooling ? `，冷卻 ${Math.ceil(skill.cooldownMs / 1000)} 秒` : ''}`} title={`${skill.name} · ${skill.price} 倍押注`} disabled={cooling} data-sfx="none" onClick={() => action(`skill${skill.slot + 1}` as SkillAction)}>
            <PixelIcon id={skill.id} />
            {cooling && <><div className="cooldown" style={{ transform: `scaleY(${ratio})` }} /><b className="cooldown-number">{Math.ceil(skill.cooldownMs / 1000)}</b></>}
          </button>;
        })}
      </div>
      <div className="mobile-side-actions" role="group" aria-label="冒險操作">
        {state.autoReport && <button className={`mobile-report-button ${state.autoReport.running ? 'is-live' : ''}`} aria-label="掛機紀錄" aria-expanded={reportOpen} title={state.autoReport.running ? '掛機中 · 查看掛機紀錄' : '查看上次掛機紀錄'} onClick={onReport}><Icon name="chart" /><span>紀錄</span></button>}
        <button className={`mobile-side-button auto-button ${state.auto ? 'is-on' : ''}`} aria-label="自動冒險" aria-pressed={state.auto} title={state.auto ? '停止自動冒險' : '自動冒險'} onClick={onAuto}><span>AUTO</span></button>
        <button className="mobile-side-button inventory-open-button" aria-label="開啟背包" aria-expanded={state.inventoryOpen ?? false} onClick={onInventory}><Icon name="bag" /></button>
      </div>
    </div>
  </>;
}
