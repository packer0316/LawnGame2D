import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { sfx, type InventoryFeedback, type ScrollRate } from '@lawn/engine';
import { FORGE_CHARGE_MS, FORGE_RESULT_MS, preloadForgeArt, SCROLL_ART, SCROLL_ART_VIEWS } from './forgeArt';
import { ForgeSequence, type ForgeSequencePlayer } from './ForgeSequence';
import './forge.css';

export function ScrollArt({ rate }: { rate: ScrollRate }) {
  return <svg className="scroll-art" role="img" aria-label={`${rate}% 武器卷軸`} viewBox={SCROLL_ART_VIEWS[rate]} preserveAspectRatio="xMidYMid meet"><image href={SCROLL_ART} width="2172" height="724" /></svg>;
}

type Phase = 'loading' | 'charge' | 'waiting' | 'result' | 'done' | 'loadError';
interface Props {
  weaponName: string; weaponArt: ReactNode; rate: ScrollRate;
  anchor: RefObject<HTMLDivElement | null>;
  result?: InventoryFeedback; onCommit: () => void; onDismiss: () => void;
}

export function ForgeRitual({ weaponName, weaponArt, rate, anchor, result, onCommit, onDismiss }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const sequence = useRef<ForgeSequencePlayer>(null);
  const [outcome, setOutcome] = useState<InventoryFeedback>();
  const [reduced, setReduced] = useState(false);
  const committed = useRef(false), commit = useRef(onCommit), dismiss = useRef(onDismiss);
  const panel = useRef<HTMLDivElement>(null);
  const sounded = useRef(new Set<string>());
  commit.current = onCommit; dismiss.current = onDismiss;
  useLayoutEffect(() => {
    const follow = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box || !panel.current) return;
      panel.current.style.left = `${box.left + box.width / 2}px`;
      panel.current.style.top = `${box.top + box.height / 2}px`;
    };
    follow();
    const observer = new ResizeObserver(follow);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); };
  }, [anchor]);
  useEffect(() => {
    let alive = true;
    panel.current?.focus({ preventScroll: true });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); change(); media.addEventListener('change', change);
    preloadForgeArt().then(() => { if (alive) setPhase('charge'); }).catch(() => { if (alive) setPhase('loadError'); });
    return () => { alive = false; media.removeEventListener('change', change); };
  }, []);
  useEffect(() => {
    const cue = phase === 'charge' ? 'forge:charge' : phase === 'result'
      ? outcome?.kind === 'success' ? 'forge:success' : outcome?.kind === 'destroyed' ? 'forge:destroyed' : 'forge:failure' : null;
    if (cue && !sounded.current.has(cue)) { sounded.current.add(cue); sfx.play(cue); }
  }, [phase, outcome]);
  useEffect(() => {
    if (phase !== 'charge' && phase !== 'result') return;
    let raf = 0, elapsed = 0, previous = performance.now();
    const duration = phase === 'charge' ? FORGE_CHARGE_MS : FORGE_RESULT_MS;
    const tick = (now: number) => {
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
    if (phase === 'waiting' && committed.current && result) { setOutcome(result); setPhase('result'); }
  }, [phase, result]);
  useEffect(() => { if (phase === 'done') dismiss.current(); }, [phase]);
  const revealed = phase === 'result' || phase === 'done';
  const success = revealed && outcome?.kind === 'success';
  const destroyed = revealed && outcome?.kind === 'destroyed';
  const art = revealed ? success ? 'success' : 'failure' : 'charge';
  const title = !revealed ? phase === 'loadError' ? '未消耗卷軸，請重試' : phase === 'loading' ? '準備刻印…' : '強化中…'
    : success ? '強化成功' : destroyed ? '強化失敗・武器損毀' : outcome?.kind === 'error' ? '無法強化' : '強化失敗・武器保留';
  // A transparent overlay anchored to the existing showcase, outside all scroll clipping.
  return createPortal(<div ref={panel} tabIndex={-1} className={`forge-ritual forge-${art} ${destroyed ? 'forge-destroyed' : ''} ${reduced ? 'forge-reduced' : ''}`}
    data-phase={phase} data-outcome={revealed ? outcome?.kind : undefined} role="region" aria-label={`${weaponName}・${rate}% 卷軸強化`} aria-busy={!revealed && phase !== 'loadError'}
    onKeyDown={e => {
      if (e.key === 'Escape' || e.code === 'KeyI') { e.stopPropagation(); if (phase === 'loadError') onDismiss(); }
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); panel.current?.querySelector('button')?.focus(); }
    }}>
    <div className="forge-stage">
      <div className="forge-weapon" aria-hidden="true">{weaponArt}</div>
      <ForgeSequence ref={sequence} art={art} reduced={reduced} />
      <div className="forge-caption" role="status" aria-live="polite">
        <strong>{title}</strong>
        {phase === 'loadError' && <button onClick={onDismiss}>關閉提示</button>}
      </div>
    </div>
  </div>, document.body);
}
