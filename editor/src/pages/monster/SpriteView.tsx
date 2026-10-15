import type { AseSheet, MonsterDef } from '@lawn/shared';
import { useEffect, useRef, useState } from 'react';
import { footOrigin } from '../../monster/sheet';
import { updateMonster } from './monsterStore';

type Rect = MonsterDef['hitbox'];
type Drag =
  | { kind: 'move'; sx: number; sy: number; start: Rect }
  | { kind: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se'; sx: number; sy: number; start: Rect }
  | { kind: 'label'; sx: number; sy: number; start: { x: number; y: number } };

/**
 * 逐幀檢視怪物 sheet：整數倍放大、腳底原點與地面線、判定框（可拖曳移動／縮放）與標籤位置（可拖曳）。
 */
export function SpriteView({
  def,
  sheet,
  image,
  frameIndex,
  zoom,
  showHitbox,
}: {
  def: MonsterDef;
  sheet: AseSheet;
  image: ImageBitmap | null;
  frameIndex: number;
  zoom: number;
  showHitbox: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ hitbox: Rect; label: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hitbox = preview?.hitbox ?? def.hitbox;
  const label = preview?.label ?? def.labelOffset;
  // 腳底在螢幕上的位置：水平置中、垂直在 70% 處
  const foot = { x: Math.round(size.w / 2), y: Math.round(size.h * 0.72) };
  const toScreen = (x: number, y: number) => ({ x: foot.x + x * zoom, y: foot.y + y * zoom });

  useEffect(() => {
    const c = canvas.current;
    if (!c || size.w === 0) return;
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#101016';
    ctx.fillRect(0, 0, size.w, size.h);
    // 棋盤格背景（每 8 像素）
    const cell = 8 * zoom;
    ctx.fillStyle = '#16151e';
    for (let y = foot.y % cell; y < size.h; y += cell) {
      for (let x = (foot.x % cell) + (Math.floor((y - (foot.y % cell)) / cell) % 2 ? cell : 0); x < size.w; x += cell * 2) {
        ctx.fillRect(x, y, cell, cell);
      }
    }
    // 地面
    ctx.fillStyle = 'rgba(90,209,106,0.12)';
    ctx.fillRect(0, foot.y, size.w, size.h - foot.y);
    ctx.strokeStyle = '#5ad16a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, foot.y + 0.5);
    ctx.lineTo(size.w, foot.y + 0.5);
    ctx.stroke();

    // 幀
    const o = footOrigin(sheet);
    const fr = sheet.frame(null, frameIndex);
    if (image && fr) {
      const p = toScreen(fr.sourceRect.x - o.x, fr.sourceRect.y - o.y);
      ctx.drawImage(image, fr.rect.x, fr.rect.y, fr.rect.w, fr.rect.h, p.x, p.y, fr.rect.w * zoom, fr.rect.h * zoom);
    }
    // 原畫布範圍
    const cv = toScreen(-o.x, -o.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cv.x + 0.5, cv.y + 0.5, sheet.frames[0]!.sourceSize.w * zoom, sheet.frames[0]!.sourceSize.h * zoom);
    ctx.setLineDash([]);
    // 原點
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(foot.x - 8, foot.y + 0.5);
    ctx.lineTo(foot.x + 8, foot.y + 0.5);
    ctx.moveTo(foot.x + 0.5, foot.y - 8);
    ctx.lineTo(foot.x + 0.5, foot.y + 8);
    ctx.stroke();

    if (showHitbox) {
      const a = toScreen(hitbox.x, hitbox.y);
      ctx.fillStyle = 'rgba(255,107,122,0.15)';
      ctx.fillRect(a.x, a.y, hitbox.w * zoom, hitbox.h * zoom);
      ctx.strokeStyle = '#ff6b7a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, hitbox.w * zoom, hitbox.h * zoom);
      ctx.fillStyle = '#ff6b7a';
      for (const [hx, hy] of corners(a, hitbox, zoom)) ctx.fillRect(hx - 4, hy - 4, 8, 8);
      // 標籤位置
      const l = toScreen(label.x, label.y);
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px system-ui';
      ctx.fillText('×倍率', l.x + 8, l.y + 4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, image, frameIndex, zoom, showHitbox, hitbox, label, size]);

  const pick = (mx: number, my: number): Drag | null => {
    if (!showHitbox) return null;
    const l = toScreen(label.x, label.y);
    if (Math.hypot(mx - l.x, my - l.y) <= 8) return { kind: 'label', sx: mx, sy: my, start: label };
    const a = toScreen(hitbox.x, hitbox.y);
    const names = ['nw', 'ne', 'sw', 'se'] as const;
    for (const [i, [hx, hy]] of corners(a, hitbox, zoom).entries()) {
      if (Math.abs(mx - hx) <= 6 && Math.abs(my - hy) <= 6) return { kind: 'resize', corner: names[i]!, sx: mx, sy: my, start: hitbox };
    }
    if (mx >= a.x && mx <= a.x + hitbox.w * zoom && my >= a.y && my <= a.y + hitbox.h * zoom) return { kind: 'move', sx: mx, sy: my, start: hitbox };
    return null;
  };

  const local = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div ref={host} className="canvas-host">
      <canvas
        ref={canvas}
        style={{ cursor: drag ? 'grabbing' : 'default' }}
        onPointerDown={(e) => {
          const [mx, my] = local(e);
          const d = pick(mx, my);
          if (!d) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDrag(d);
          setPreview({ hitbox, label });
        }}
        onPointerMove={(e) => {
          const [mx, my] = local(e);
          if (!drag) {
            const d = pick(mx, my);
            canvas.current!.style.cursor = !d ? 'default' : d.kind === 'resize' ? 'nwse-resize' : 'move';
            return;
          }
          const dx = Math.round((mx - drag.sx) / zoom);
          const dy = Math.round((my - drag.sy) / zoom);
          if (drag.kind === 'label') setPreview({ hitbox, label: { x: drag.start.x + dx, y: drag.start.y + dy } });
          else if (drag.kind === 'move') setPreview({ label, hitbox: { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy } });
          else setPreview({ label, hitbox: resize(drag.start, drag.corner, dx, dy) });
        }}
        onPointerUp={() => {
          if (drag && preview) {
            if (drag.kind === 'label') updateMonster(def.id, (d) => ({ ...d, labelOffset: preview.label }), '標籤位置');
            else updateMonster(def.id, (d) => ({ ...d, hitbox: preview.hitbox }), '判定框');
          }
          setDrag(null);
          setPreview(null);
        }}
      />
    </div>
  );
}

function corners(a: { x: number; y: number }, r: Rect, zoom: number): [number, number][] {
  const x2 = a.x + r.w * zoom;
  const y2 = a.y + r.h * zoom;
  return [
    [a.x, a.y],
    [x2, a.y],
    [a.x, y2],
    [x2, y2],
  ];
}

function resize(r: Rect, corner: 'nw' | 'ne' | 'sw' | 'se', dx: number, dy: number): Rect {
  let { x, y, w, h } = r;
  if (corner.includes('w')) {
    x += dx;
    w -= dx;
  } else w += dx;
  if (corner.includes('n')) {
    y += dy;
    h -= dy;
  } else h += dy;
  if (w < 1) {
    x += w - 1;
    w = 1;
  }
  if (h < 1) {
    y += h - 1;
    h = 1;
  }
  return { x, y, w, h };
}
