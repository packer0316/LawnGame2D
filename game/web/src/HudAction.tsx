import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PixelIcon } from './PixelIcon';
import './skill-art.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  label: string;
  description: string;
  art: string;
  details?: ReactNode;
}

/** Portal keeps hover descriptions outside the clipped skill/cooldown tile. */
export function HudAction({ label, description, art, details, disabled, children, onClick, ...props }: Props) {
  const id = useId(), button = useRef<HTMLButtonElement>(null), tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { hide(); }, [label]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect(), box = tip.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      const left = Math.max(12, Math.min(window.innerWidth - box.width - 12, anchor.left + anchor.width / 2 - box.width / 2));
      const above = anchor.top - box.height - 12;
      const top = Math.max(12, Math.min(window.innerHeight - box.height - 12, above >= 12 ? above : anchor.bottom + 12));
      setPosition({ left, top });
    };
    place();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('keydown', escape); };
  }, [open, label]);
  return <>
    <button {...props} ref={button} type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-disabled={disabled || undefined}
      onPointerEnter={e => { if (e.pointerType !== 'touch') show(); }} onPointerLeave={leave}
      onFocus={show} onBlur={hide} onClick={e => { if (!disabled) onClick?.(e); }}>
      <PixelIcon id={art} />{children}
    </button>
    {open && createPortal(<div id={id} ref={tip} role="tooltip" className="hud-art-tooltip" style={position} onPointerEnter={show} onPointerLeave={leave}>
      <div className="hud-art-tooltip-heading"><PixelIcon id={art} /><strong>{label}</strong></div>
      <p>{description}</p>
      {details && <div className="hud-art-tooltip-details">{details}</div>}
    </div>, document.body)}
  </>;
}
