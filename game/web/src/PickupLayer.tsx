import { useEffect, useRef, useState } from 'react';
import type { HudState } from '@lawn/engine';
import { Icon } from './Icons';

type Pickup = HudState['pickups'][number];

/**
 * 撿到技能方塊：從怪物掉落的位置飛進技能列那一格（實際模式）。
 * 遊戲畫面只畫在 HUD 上方，所以飛行這段交給 HUD 用 DOM 做；落到格子時那一格閃一下。
 */
export function PickupLayer({ pickups, onArrive }: { pickups: Pickup[]; onArrive: (slot: number) => void }) {
  const seen = useRef(new Set<number>());
  const [flying, setFlying] = useState<Pickup[]>([]);

  useEffect(() => {
    const fresh = pickups.filter((p) => !seen.current.has(p.id));
    if (fresh.length === 0) return;
    for (const p of fresh) seen.current.add(p.id);
    setFlying((list) => [...list, ...fresh]);
  }, [pickups]);

  return (
    <>
      {flying.map((p) => (
        <FlyingCube
          key={p.id}
          pickup={p}
          onDone={() => {
            setFlying((list) => list.filter((f) => f.id !== p.id));
            onArrive(p.slot);
          }}
        />
      ))}
    </>
  );
}

function FlyingCube({ pickup, onDone }: { pickup: Pickup; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const slot = document.querySelector<HTMLElement>(`.hotbar-slot[data-slot="${pickup.slot}"]`);
    if (!el || !slot) {
      onDone();
      return;
    }
    const rect = slot.getBoundingClientRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;
    // 先往上彈一下，再弧線飛進格子
    const midX = (pickup.x + tx) / 2;
    const midY = Math.min(pickup.y, ty) - 80;
    const animation = el.animate(
      [
        { transform: `translate(${pickup.x}px, ${pickup.y}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
        { transform: `translate(${midX}px, ${midY}px) translate(-50%, -50%) scale(1.35)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.9)`, opacity: 0.9 },
      ],
      { duration: pickup.flightMs, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' },
    );
    animation.onfinish = onDone;
    return () => animation.cancel();
  }, []);
  return (
    <div ref={ref} className="pickup-cube" title={pickup.name}>
      <Icon name={pickup.icon} />
    </div>
  );
}
