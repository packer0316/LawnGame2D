import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { InventoryFeedback, ScrollRate } from '@lawn/engine';
import { FORGE_CHARGE_MS, FORGE_RESULT_MS, preloadForgeArt, SCROLL_ART } from './forgeArt';
import { ForgeSequence, type ForgeSequencePlayer } from './ForgeSequence';
import './forge.css';

export function ScrollArt({ rate }: { rate: ScrollRate }) {
  return <span className="scroll-art" role="img" aria-label={`${rate}% 武器卷軸`} style={{ backgroundImage: `url("${SCROLL_ART}")`, backgroundPosition: `${rate === 10 ? 0 : rate === 60 ? 50 : 100}% 50%` }} />;
}

type Phase = 'loading' | 'charge' | 'waiting' | 'result' | 'done' | 'loadError';
interface Props {
  weaponName: string; weaponArt: ReactNode; rate: ScrollRate;
  result?: InventoryFeedback; onCommit: () => void; onDismiss: () => void;
}

export function ForgeRitual({ weaponName, weaponArt, rate, result, onCommit, onDismiss }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const sequence = useRef<ForgeSequencePlayer>(null);
  const [outcome, setOutcome] = useState<InventoryFeedback>();
  const [reduced, setReduced] = useState(false);
  const committed = useRef(false), commit = useRef(onCommit), panel = useRef<HTMLDivElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  commit.current = onCommit;
  useEffect(() => {
    let alive = true;
    panel.current?.focus();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); change(); media.addEventListener('change', change);
    preloadForgeArt().then(() => { if (alive) setPhase('charge'); }).catch(() => { if (alive) setPhase('loadError'); });
    return () => { alive = false; media.removeEventListener('change', change); };
  }, []);
  useEffect(() => {
    if (phase !== 'charge' && phase !== 'result') return;
    let raf = 0, elapsed = 0, previous = performance.now();
    const duration = phase === 'charge' ? FORGE_CHARGE_MS : FORGE_RESULT_MS;
    const tick = (now: number) => {
      // Hidden tabs pause the presentation; a stalled frame cannot skip the reveal.
      if (!document.hidden) elapsed += Math.max(0, Math.min(80, now - previous));
      previous = now;
      sequence.current?.seek(elapsed / duration);
      if (elapsed >= duration) {
        if (phase === 'charge') {
          setPhase('waiting');
          if (!committed.current) { committed.current = true; commit.current(); }
        } else setPhase('done');
      } else raf = requestAnimationFrame(tick);
    };
    sequence.current?.seek(0); raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  useEffect(() => {
    if (phase === 'waiting' && committed.current && result) {
      setOutcome(result); setPhase('result');
    }
  }, [phase, result]);
  useEffect(() => { if (phase === 'done' || phase === 'loadError') doneButton.current?.focus(); }, [phase]);
  const revealed = phase === 'result' || phase === 'done';
  const success = revealed && outcome?.kind === 'success';
  const destroyed = revealed && outcome?.kind === 'destroyed';
  const art = revealed ? success ? 'success' : 'failure' : 'charge';
  const title = !revealed ? phase === 'loadError' ? '法陣尚未就緒' : '神聖刻印'
    : success ? '刻印成功' : destroyed ? '刻印失敗・武器損毀' : outcome?.kind === 'error' ? '未能完成刻印' : '刻印失敗・武器保留';
  return <div ref={panel} tabIndex={-1} className={`forge-ritual ${revealed ? `forge-${art}` : ''} ${destroyed ? 'forge-destroyed' : ''} ${reduced ? 'forge-reduced' : ''}`}
    data-phase={phase} data-outcome={revealed ? outcome?.kind : undefined} role="region" aria-label="武器卷軸刻印" aria-busy={!revealed && phase !== 'loadError'}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (phase === 'done' || phase === 'loadError') onDismiss(); } }}>
    <div className="forge-vignette" />
    <header className="forge-heading"><span>CELESTIAL INSCRIPTION</span><h3>{title}</h3><p>{weaponName} · {rate}% 武器卷軸</p></header>
    <div className="forge-stage" aria-hidden="true">
      <div className="forge-aura" />
      <ForgeSequence ref={sequence} art={art} reduced={reduced} done={phase === 'done'} />
      <div className="forge-weapon">{weaponArt}</div>
      {!revealed && <div className="forge-scroll"><ScrollArt rate={rate} /></div>}
    </div>
    <div className="forge-caption" role="status" aria-live="polite">
      {revealed ? <p>{outcome?.message}</p> : <p>{phase === 'loading' ? '正在喚醒法陣…' : phase === 'waiting' ? '聖印正在凝結…' : phase === 'loadError' ? '素材暫時無法載入，尚未消耗卷軸。請返回工坊後重試。' : '符文匯聚，聖光正在刻入武器…'}</p>}
    </div>
    <div className="forge-footer">{phase === 'done' || phase === 'loadError'
      ? <button ref={doneButton} onClick={onDismiss}>返回工坊</button>
      : <span>刻印進行中</span>}</div>
  </div>;
}
