import { useEffect, useRef } from 'react';

/** 押注清單：目前押注置中；點清單外面或按 Esc 關閉。 */
export function BetPicker({ levels, bet, onPick, onClose }: { levels: number[]; bet: number; onPick: (bet: number) => void; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('.current');
    if (list && current) list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
  }, []);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.panel.bet')) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const min = levels[0], max = levels.at(-1);
  return <div className="panel bet-picker">
    <div className="bet-picker-list" ref={listRef} role="listbox" aria-label="每刀押注">
      {levels.map(level => <button key={level} role="option" aria-selected={level === bet} className={level === bet ? 'current' : ''} onClick={() => onPick(level)}>{level.toLocaleString()}</button>)}
    </div>
    <div className="bet-picker-ends">
      <button disabled={min === undefined || bet === min} onClick={() => min !== undefined && onPick(min)}>MIN</button>
      <button disabled={max === undefined || bet === max} onClick={() => max !== undefined && onPick(max)}>MAX</button>
    </div>
  </div>;
}
