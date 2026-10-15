import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section">
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
        <span style={{ flex: 1 }} />
        {actions}
      </h4>
      {children}
    </div>
  );
}

export function Field({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="field" title={title}>
      <label>{label}</label>
      <div className="row">{children}</div>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      className={mono ? 'mono' : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** 數字輸入：打字中允許暫時不合法的字串，合法時才送出。 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  integer,
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  width?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    if (integer && !Number.isInteger(n)) return;
    if (min !== undefined && n < min) return;
    if (max !== undefined && n > max) return;
    onChange(n);
  };
  return (
    <input
      type="number"
      value={text}
      step={step}
      min={min}
      max={max}
      style={width ? { width, flex: 'none' } : undefined}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => setText(String(value))}
    />
  );
}

export function RangeInput({
  value,
  onChange,
  min,
  step,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
  min?: number;
  step?: number;
}) {
  return (
    <>
      <NumberInput value={value[0]} min={min} step={step} onChange={(a) => onChange([a, Math.max(a, value[1])])} />
      <span className="hint">–</span>
      <NumberInput value={value[1]} min={min} step={step} onChange={(b) => onChange([Math.min(value[0], b), b])} />
    </>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-fA-F]{6}/.exec(value)?.[0] ?? '#ffffff';
  return (
    <>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value + value.slice(7))} />
      <TextInput value={value} mono onChange={onChange} />
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="canvas-empty">{children}</div>;
}
