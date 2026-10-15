import { AVATAR_SLICES } from '@lawn/shared';
import type { DrawOp, Expression } from '@lawn/shared';
import { useEffect, useRef, useState } from 'react';
import { anchorAt } from '../../avatar/render';
import type { AvatarRenderer } from '../../avatar/render';

const SLICE_COLORS: Record<string, string> = { head: '#f2c14e', torso: '#5ad1a6', hand: '#ff6b7a' };

/**
 * 紙娃娃畫布：整數倍放大、腳底原點、可顯示洋蔥皮（前一幀）與錨點。
 * onDragOffset 有值時可以拖曳部件（錨點對齊），放開時回報像素位移。
 */
export function AvatarCanvas({
  renderer,
  frame,
  zoom,
  onionSkin,
  showAnchors,
  expression,
  highlight,
  onDragOffset,
}: {
  renderer: AvatarRenderer;
  frame: number;
  zoom: number;
  onionSkin?: boolean;
  showAnchors?: boolean;
  expression?: Expression;
  /** 只讓這個部件不透明，其他半透明（方便看部件本身）。 */
  highlight?: string | null;
  onDragOffset?: (dx: number, dy: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const foot = { x: Math.round(size.w / 2), y: Math.round(size.h * 0.7) };

  useEffect(() => {
    const c = canvas.current;
    if (!c || size.w === 0) return;
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#101016';
    ctx.fillRect(0, 0, size.w, size.h);
    const cell = 8 * zoom;
    ctx.fillStyle = '#17161f';
    for (let y = foot.y % cell; y < size.h; y += cell) {
      for (let x = (foot.x % cell) + (Math.round((y - (foot.y % cell)) / cell) % 2 ? cell : 0); x < size.w; x += cell * 2) ctx.fillRect(x, y, cell, cell);
    }
    ctx.strokeStyle = 'rgba(90,209,106,0.6)';
    ctx.beginPath();
    ctx.moveTo(0, foot.y + 0.5);
    ctx.lineTo(size.w, foot.y + 0.5);
    ctx.stroke();

    const dx = drag ? drag.dx * zoom : 0;
    const dy = drag ? drag.dy * zoom : 0;
    if (onionSkin) {
      const ops = renderer.ops(frame);
      if (ops.length) renderer.draw(ctx, Math.max(0, frame - 1), foot.x, foot.y, zoom, { expression, alpha: 0.28 });
    }
    if (highlight) {
      renderer.draw(ctx, frame, foot.x, foot.y, zoom, { expression, alpha: 0.35, filter: (op: DrawOp) => op.source !== highlight });
      renderer.draw(ctx, frame, foot.x + dx, foot.y + dy, zoom, { expression, filter: (op: DrawOp) => op.source === highlight });
    } else {
      renderer.draw(ctx, frame, foot.x, foot.y, zoom, { expression });
    }

    if (showAnchors) {
      for (const s of AVATAR_SLICES) {
        const p = anchorAt(renderer.base.sheet, s, frame);
        if (!p) continue;
        const x = foot.x + p.x * zoom + zoom / 2;
        const y = foot.y + p.y * zoom + zoom / 2;
        ctx.strokeStyle = SLICE_COLORS[s]!;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
        ctx.fillStyle = SLICE_COLORS[s]!;
        ctx.font = '11px system-ui';
        ctx.fillText(s, x + 8, y - 4);
      }
    }
  }, [renderer, frame, zoom, onionSkin, showAnchors, expression, highlight, size, drag, foot.x, foot.y]);

  return (
    <div ref={host} className="canvas-host">
      <canvas
        ref={canvas}
        style={{ cursor: onDragOffset ? (drag ? 'grabbing' : 'grab') : 'default' }}
        onPointerDown={(e) => {
          if (!onDragOffset) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDrag({ sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setDrag({ ...drag, dx: Math.round((e.clientX - drag.sx) / zoom), dy: Math.round((e.clientY - drag.sy) / zoom) });
        }}
        onPointerUp={() => {
          if (drag && (drag.dx || drag.dy)) onDragOffset?.(drag.dx, drag.dy);
          setDrag(null);
        }}
      />
    </div>
  );
}
