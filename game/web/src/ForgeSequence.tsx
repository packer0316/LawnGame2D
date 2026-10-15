import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { FORGE_ART, FORGE_FRAMES } from './forgeArt';

export interface ForgeSequencePlayer { seek: (progress: number) => void }
type Art = keyof typeof FORGE_ART;
/** Blend adjacent light-field keyframes at display refresh rate, without rerendering the workshop. */
export const ForgeSequence = forwardRef<ForgeSequencePlayer, { art: Art; reduced: boolean; done: boolean }>(function ForgeSequence({ art, reduced, done }, ref) {
  const root = useRef<HTMLDivElement>(null), current = useRef<HTMLDivElement>(null), next = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const paint = (value: number) => {
    progress.current = Math.max(0, Math.min(1, value));
    const position = reduced ? art === 'charge' ? 5 : 3 : progress.current * (FORGE_FRAMES - 1);
    const frame = Math.floor(position), following = Math.min(FORGE_FRAMES - 1, frame + 1), blend = position - frame;
    if (!root.current || !current.current || !next.current) return;
    root.current.dataset.frame = String(frame);
    root.current.dataset.blend = blend.toFixed(4);
    root.current.dataset.progress = progress.current.toFixed(4);
    for (const [layer, index, opacity] of [[current.current, frame, 1 - blend], [next.current, following, blend]] as const) {
      layer.style.backgroundPosition = `${index % 4 / 3 * 100}% ${Math.floor(index / 4) / 2 * 100}%`;
      layer.style.opacity = String(opacity);
    }
  };
  useImperativeHandle(ref, () => ({ seek: paint }));
  useLayoutEffect(() => { paint(0); }, [art]);
  useLayoutEffect(() => { paint(progress.current); }, [reduced]);
  return <div ref={root} className="forge-sequence" data-sequence={art} data-frame="0" style={{ opacity: done ? 0 : 1 }}>
    <div ref={current} className="forge-sequence-frame" style={{ backgroundImage: `url("${FORGE_ART[art]}")` }} />
    <div ref={next} className="forge-sequence-frame" style={{ backgroundImage: `url("${FORGE_ART[art]}")`, opacity: 0 }} />
  </div>;
});
