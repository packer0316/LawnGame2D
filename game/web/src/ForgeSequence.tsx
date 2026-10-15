import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';

export interface ForgeSequencePlayer { seek: (progress: number) => void }
export type ForgeArt = 'charge' | 'success' | 'failure';
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Continuous concentric light fields: stable pivots, no mismatched atlas frames. */
export const ForgeSequence = forwardRef<ForgeSequencePlayer, { art: ForgeArt; reduced: boolean }>(function ForgeSequence({ art, reduced }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef(0);
  const paint = (value: number) => {
    progress.current = clamp(value);
    const node = canvas.current, ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    node.dataset.progress = progress.current.toFixed(4);
    const p = reduced ? art === 'charge' ? .65 : .35 : progress.current;
    const charge = art === 'charge', success = art === 'success';
    const fade = charge ? clamp(p * 5) : Math.pow(1 - p, .8);
    const gold = charge || success;
    const color = gold ? '#ffe8a6' : '#a9bce0';
    ctx.clearRect(0, 0, 640, 480);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const glow = (x: number, y: number, radius: number, strength: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, gold ? `rgba(255,224,141,${strength})` : `rgba(141,168,216,${strength})`);
      g.addColorStop(.35, gold ? `rgba(226,164,60,${strength * .3})` : `rgba(106,128,184,${strength * .3})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    const star = (x: number, y: number, size: number, alpha: number) => {
      ctx.globalAlpha = clamp(alpha); ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * .22, y - size * .22);
      ctx.lineTo(x + size, y); ctx.lineTo(x + size * .22, y + size * .22);
      ctx.lineTo(x, y + size); ctx.lineTo(x - size * .22, y + size * .22);
      ctx.lineTo(x - size, y); ctx.lineTo(x - size * .22, y - size * .22);
      ctx.closePath(); ctx.fill();
    };
    glow(320, 240, charge ? 180 : 220, fade * (charge ? .16 + p * .12 : .52));
    // Every ring and rune shares one perspective plane.
    ctx.save(); ctx.translate(320, 336); ctx.scale(1, .32);
    const radius = charge ? 132 + 18 * Math.sin(p * Math.PI) : 142 + p * (success ? 100 : -65);
    ctx.rotate((charge ? p * .32 : .34) * (reduced ? 0 : 1));
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
    for (const [scale, width, opacity] of [[1, 2, .85], [.94, .8, .55], [.72, 1.5, .75]] as const) {
      ctx.globalAlpha = fade * opacity; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(0, 0, radius * scale, 0, TAU); ctx.stroke();
    }
    ctx.shadowBlur = 4; ctx.lineWidth = 1.3;
    for (let i = 0; i < 24; i++) {
      ctx.save(); ctx.rotate(i * TAU / 24);
      ctx.globalAlpha = fade * (i % 3 === 0 ? .95 : .5);
      ctx.beginPath(); ctx.moveTo(radius * .79, -3); ctx.lineTo(radius * .85, -3);
      ctx.lineTo(radius * .88, 3); ctx.lineTo(radius * .81, 3); ctx.stroke();
      if (i % 3 === 0) { ctx.beginPath(); ctx.moveTo(radius * 1.02, 0); ctx.lineTo(radius * 1.08, 0); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (charge) {
      const beam = ctx.createLinearGradient(0, 95, 0, 343);
      beam.addColorStop(0, 'transparent'); beam.addColorStop(.82, `rgba(255,219,127,${fade * .3})`); beam.addColorStop(1, 'transparent');
      ctx.fillStyle = beam;
      for (const x of [222, 274, 366, 418]) ctx.fillRect(x - 3, 110 + Math.abs(x - 320) * .3, 6, 225);
      for (let i = 0; i < 22; i++) {
        const t = (p * 1.25 + i * .618) % 1;
        const a = i * 2.399 + p * .6, r = 150 * (1 - t) + 18;
        star(320 + Math.cos(a) * r, 254 + Math.sin(a) * r * .65 - t * 28, 2 + t * 3, fade * Math.sin(t * Math.PI) * .85);
      }
      const seal = clamp((p - .7) / .3);
      ctx.globalAlpha = seal * .85; ctx.strokeStyle = '#fff5d7'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(320, 242, 70 * (1 - seal) + 12, 0, TAU); ctx.stroke();
    } else if (success) {
      const burst = Math.sin(clamp(p / .28) * Math.PI);
      glow(320, 240, 110, burst * .65);
      ctx.globalAlpha = fade * .65; ctx.strokeStyle = '#fff1c8'; ctx.lineWidth = 2 * (1 - p) + .5;
      ctx.beginPath(); ctx.ellipse(320, 240, 30 + p * 190, 30 + p * 120, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 30; i++) {
        const a = i * 2.399, r = 24 + Math.pow(p, .6) * (100 + i % 5 * 22);
        star(320 + Math.cos(a) * r, 240 + Math.sin(a) * r * .7 + p * p * 30, (i % 4 === 0 ? 8 : 3) * (1 - p * .6), fade * (.5 + i % 3 * .2));
      }
      star(320, 240, 34 * (1 - p), fade * .9);
    } else {
      for (let i = 0; i < 18; i++) {
        const a = i * 2.399, r = 28 + p * (45 + i % 4 * 16);
        const x = 320 + Math.cos(a) * r, y = 255 + Math.sin(a) * r * .5 + p * p * 90;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + p);
        ctx.globalAlpha = fade * .75; ctx.fillStyle = i % 3 ? '#a4b3d0' : '#fff0c4';
        ctx.fillRect(-1.5, -4, 3, 8); ctx.restore();
      }
    }
    ctx.restore();
  };
  useImperativeHandle(ref, () => ({ seek: paint }));
  useLayoutEffect(() => { paint(0); }, [art]);
  useLayoutEffect(() => { paint(progress.current); }, [reduced]);
  return <canvas ref={canvas} width={640} height={480} className="forge-sequence" data-sequence={art} aria-hidden="true" />;
});
