import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SCROLL_RATES, WEAPONS, WEAPON_ART, WEAPON_BY_ID, type AutoReportItem, type AutoReportView, type ScrollRate } from '@lawn/engine';
import { Icon } from './Icons';
import { ScrollArt } from './ForgeRitual';
import './auto-report.css';

/** 掛機時間：10:39、1:02:05 */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function signed(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? '+' : ''}${v.toLocaleString()}`;
}

/** 座標軸用：千萬以上縮成萬／億，其餘照實顯示 */
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return `${+(n / 1e8).toFixed(2)}億`;
  if (a >= 1e7) return `${Math.round(n / 1e4).toLocaleString()}萬`;
  return Math.round(n).toLocaleString();
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('zh-TW', { hour12: false });
}

function tone(n: number): string {
  return n > 0 ? 'win' : n < 0 ? 'loss' : '';
}

/** 每次 render 與視窗縮放時重新擺位置（直接改 style，不觸發 React 更新）。 */
function usePlacement(target: RefObject<HTMLElement | null>, place: (el: HTMLElement) => void): void {
  const latest = useRef(place);
  latest.current = place;
  useLayoutEffect(() => {
    if (target.current) latest.current(target.current);
  });
  useEffect(() => {
    const onResize = () => target.current && latest.current(target.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [target]);
}

/**
 * 「已掛機 10:39」按鈕：浮在操作列上緣、對齊「冒險中」按鈕的正上方（操作列換成兩排時也在整條操作列上面）。
 * 掛機中綠燈，停止後顯示上次的紀錄。
 */
export function AutoReportButton({ report, open, onClick, anchor, dock, buttonRef }: {
  report: AutoReportView;
  open: boolean;
  onClick: () => void;
  /** 對齊的按鈕（冒險中） */
  anchor: RefObject<HTMLElement | null>;
  /** 操作列：按鈕放在它上面 */
  dock: RefObject<HTMLElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  usePlacement(buttonRef, (el) => {
    const a = anchor.current?.getBoundingClientRect();
    const d = dock.current?.getBoundingClientRect();
    if (!a || !d) return;
    el.style.left = `${a.left + a.width / 2}px`;
    el.style.bottom = `${window.innerHeight - d.top + 8}px`;
  });
  const net = report.balance - report.startBalance;
  return (
    <button ref={buttonRef} className="auto-report-button" aria-expanded={open} title="查看掛機收益" onClick={onClick}>
      <i className={report.running ? 'live' : ''} />
      {report.running ? '已掛機' : '上次掛機'} {formatDuration(report.elapsedMs)}
      <b className={tone(net)}>{signed(net)}</b>
    </button>
  );
}

type RangeId = '1m' | '5m' | '15m' | '1h' | 'all';
/** 時間級距：看最近一段，或整次掛機 */
const RANGES: { id: RangeId; label: string; ms: number }[] = [
  { id: '1m', label: '1分', ms: 60_000 },
  { id: '5m', label: '5分', ms: 300_000 },
  { id: '15m', label: '15分', ms: 900_000 },
  { id: '1h', label: '1時', ms: 3_600_000 },
  { id: 'all', label: '全部', ms: Infinity },
];

function RangeTabs({ range, onChange }: { range: RangeId; onChange: (range: RangeId) => void }) {
  return (
    <div className="auto-report-ranges" role="group" aria-label="時間級距">
      {RANGES.map((r) => <button key={r.id} aria-pressed={r.id === range} onClick={() => onChange(r.id)}>{r.label}</button>)}
    </div>
  );
}

/** 掛機收益：財產變化折線圖＋獲得的裝備與卷軸（同樣的合併成 ×N）。停止後仍可查看，直到下次開始掛機。 */
export function AutoReportPanel({ report, onClose, buttonRef }: { report: AutoReportView; onClose: () => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<RangeId>('all');
  const [zoom, setZoom] = useState(false);
  // 從「已掛機」按鈕往上展開，左右不超出畫面
  usePlacement(panelRef, (el) => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(440, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, b.left + b.width / 2 - width / 2));
    el.style.width = `${width}px`;
    el.style.left = `${left}px`;
    el.style.bottom = `${window.innerHeight - b.top + 8}px`;
    el.style.maxHeight = `${Math.max(160, b.top - 20)}px`;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoom) setZoom(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, zoom]);
  const net = report.balance - report.startBalance;
  const items = [...report.items].sort((a, b) => (b.times.at(-1) ?? 0) - (a.times.at(-1) ?? 0));
  const weapons = report.items.filter((i) => i.kind === 'weapon').reduce((n, i) => n + i.count, 0);
  const scrolls = report.items.filter((i) => i.kind === 'scroll').reduce((n, i) => n + i.count, 0);
  const rangeMs = RANGES.find((r) => r.id === range)!.ms;
  return (
    <>
      <div ref={panelRef} className="panel auto-report" role="dialog" aria-label="掛機收益">
        <div className="auto-report-heading">
          <div>
            <span className="eyebrow">AUTO ADVENTURE REPORT</span>
            <h3>掛機收益</h3>
          </div>
          <button aria-label="關閉掛機收益" onClick={onClose}><Icon name="close" /></button>
        </div>
        <Status report={report} />
        <div className="auto-report-stats">
          <div><small>掛機時間</small><strong>{formatDuration(report.elapsedMs)}</strong></div>
          <div><small>輸贏</small><strong className={tone(net)}>{signed(net)}</strong></div>
          <div><small>財產</small><strong>{Math.round(report.balance).toLocaleString()}</strong><span>起始 {Math.round(report.startBalance).toLocaleString()}</span></div>
          <div><small>最高／最低</small><strong>{Math.round(report.high).toLocaleString()}</strong><span>最低 {Math.round(report.low).toLocaleString()}</span></div>
        </div>
        <div className="auto-report-chart-heading">
          <h4>財產變化</h4>
          <RangeTabs range={range} onChange={setRange} />
          <button className="auto-report-zoom-button" aria-label="放大財產變化" title="放大" onClick={() => setZoom(true)}><Icon name="expand" /></button>
        </div>
        <BalanceChart report={report} rangeMs={rangeMs} size="small" onClick={() => setZoom(true)} />
        <h4>獲得裝備與卷軸 <small>{weapons > 0 || scrolls > 0 ? `裝備 ${weapons} 件 · 卷軸 ${scrolls} 張` : ''}</small></h4>
        {items.length === 0 ? (
          <p className="auto-report-empty">這次掛機還沒有掉落裝備或卷軸。</p>
        ) : (
          <ul className="auto-report-items">
            {items.map((item) => (
              <li key={`${item.kind}:${item.id ?? item.name}`} className={item.kind}>
                <ItemArt item={item} />
                <span className="name">{item.name}</span>
                <b>×{item.count}</b>
                <time title={item.times.map(clock).join('、')}>{clock(item.times.at(-1) ?? report.startedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
      {zoom && <ChartZoom report={report} range={range} onRange={setRange} onClose={() => setZoom(false)} />}
    </>
  );
}

function Status({ report }: { report: AutoReportView }) {
  return (
    <p className={`auto-report-status ${report.running ? 'live' : ''}`}>
      <i />
      {report.running
        ? `掛機中 · ${clock(report.startedAt)} 開始`
        : `已停止${report.stopReason ? `：${report.stopReason}` : ''} · ${clock(report.startedAt)}–${clock(report.endedAt ?? report.startedAt)}`}
    </p>
  );
}

/** 掉落的圖：武器取背包同一張圖格，卷軸用鍛造的卷軸圖；舊紀錄沒有 id 就用名稱找。 */
function ItemArt({ item }: { item: AutoReportItem }) {
  if (item.kind === 'scroll') {
    const rate = Number((item.id ?? item.name).match(/\d+/)?.[0]);
    if ((SCROLL_RATES as readonly number[]).includes(rate)) return <span className="auto-report-thumb"><ScrollArt rate={rate as ScrollRate} /></span>;
  } else {
    const weapon = (item.id ? WEAPON_BY_ID.get(item.id) : undefined) ?? WEAPONS.find((w) => w.name === item.name);
    if (weapon) {
      return (
        <span className="auto-report-thumb">
          <span role="img" aria-label={weapon.name} className="auto-report-weapon" style={{ backgroundImage: `url("${WEAPON_ART[weapon.kind]}")`, backgroundPosition: `${(weapon.frame % 5) * 25}% ${Math.floor(weapon.frame / 5) * 100}%` }} />
        </span>
      );
    }
  }
  return <span className="auto-report-thumb" />;
}

/** 放大看：整個畫面的大圖，同樣可以切時間級距。 */
function ChartZoom({ report, range, onRange, onClose }: { report: AutoReportView; range: RangeId; onRange: (range: RangeId) => void; onClose: () => void }) {
  const rangeMs = RANGES.find((r) => r.id === range)!.ms;
  const window_ = visibleWindow(report, rangeMs);
  const change = window_.points.at(-1)![1] - window_.points[0]![1];
  const net = report.balance - report.startBalance;
  return (
    <div className="auto-report-zoom-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel auto-report-zoom" role="dialog" aria-label="財產變化（放大）">
        <div className="auto-report-heading">
          <div>
            <span className="eyebrow">BALANCE CHART</span>
            <h3>財產變化</h3>
          </div>
          <div className="auto-report-zoom-tools">
            <RangeTabs range={range} onChange={onRange} />
            <button aria-label="關閉放大圖" onClick={onClose}><Icon name="close" /></button>
          </div>
        </div>
        <Status report={report} />
        <div className="auto-report-stats">
          <div><small>{range === 'all' ? '整次掛機' : `最近 ${RANGES.find((r) => r.id === range)!.label}`}</small><strong>{formatDuration(window_.tStart)} – {formatDuration(window_.tEnd)}</strong></div>
          <div><small>此區間輸贏</small><strong className={tone(change)}>{signed(change)}</strong></div>
          <div><small>總輸贏</small><strong className={tone(net)}>{signed(net)}</strong></div>
          <div><small>財產</small><strong>{Math.round(report.balance).toLocaleString()}</strong></div>
        </div>
        <BalanceChart report={report} rangeMs={rangeMs} size="large" />
      </div>
    </div>
  );
}

type Point = [number, number];

/** 時間級距內的點：左邊界用內插補一點，曲線才會從邊界開始。 */
function visibleWindow(report: AutoReportView, rangeMs: number): { points: Point[]; tStart: number; tEnd: number } {
  const all: Point[] = report.points.length > 0 ? report.points : [[0, report.balance]];
  const tEnd = Math.max(1000, all[all.length - 1]![0]);
  const tStart = Number.isFinite(rangeMs) ? Math.max(0, tEnd - rangeMs) : 0;
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid]![0] < tStart) lo = mid + 1;
    else hi = mid;
  }
  const points = all.slice(lo);
  const before = all[lo - 1];
  const after = points[0];
  if (before && (!after || after[0] > tStart)) {
    const v = after ? before[1] + ((after[1] - before[1]) * (tStart - before[0])) / (after[0] - before[0]) : before[1];
    points.unshift([tStart, v]);
  }
  if (points.length === 0) points.push([tStart, report.balance]);
  return { points, tStart, tEnd };
}

/** 點太多時每個像素寬只留頭、尾、最高、最低，尖峰不會被抽掉。 */
function downsample(points: Point[], t0: number, t1: number, buckets: number): Point[] {
  if (points.length <= buckets * 2) return points;
  const out: Point[] = [];
  let bucket = -1;
  let group: Point[] = [];
  const flush = () => {
    if (group.length === 0) return;
    let min = group[0]!;
    let max = group[0]!;
    for (const p of group) {
      if (p[1] < min[1]) min = p;
      if (p[1] > max[1]) max = p;
    }
    out.push(...[...new Set([group[0]!, min, max, group[group.length - 1]!])].sort((a, b) => a[0] - b[0]));
  };
  for (const p of points) {
    const b = Math.min(buckets - 1, Math.floor(((p[0] - t0) / Math.max(1, t1 - t0)) * buckets));
    if (b !== bucket) {
      flush();
      bucket = b;
      group = [];
    }
    group.push(p);
  }
  flush();
  return out;
}

/** 中文字約兩倍寬：估提示框寬度用 */
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[　-鿿＀-￯]/.test(ch) ? size : size * 0.6;
  return w;
}

const SIZES = {
  small: { W: 400, H: 150, left: 58, right: 8, top: 10, bottom: 20, yTicks: 2, xTicks: 2, font: 10 },
  large: { W: 1000, H: 430, left: 78, right: 16, top: 16, bottom: 30, yTicks: 5, xTicks: 7, font: 12 },
};

function BalanceChart({ report, rangeMs, size, onClick }: { report: AutoReportView; rangeMs: number; size: 'small' | 'large'; onClick?: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const S = SIZES[size];
  const plot = { left: S.left, right: S.W - S.right, top: S.top, bottom: S.H - S.bottom };
  const { points, tStart, tEnd } = visibleWindow(report, rangeMs);
  const span = Math.max(1000, tEnd - tStart);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    if (p[1] < lo) lo = p[1];
    if (p[1] > hi) hi = p[1];
  }
  // 從頭看才把起始財產算進範圍；只看最近一段時以那段的高低為準
  if (tStart === 0) {
    lo = Math.min(lo, report.startBalance);
    hi = Math.max(hi, report.startBalance);
  }
  const dataLo = lo;
  const dataHi = hi;
  const pad = Math.max(1, (hi - lo) * 0.08);
  lo -= pad;
  hi += pad;
  const x = (t: number) => plot.left + ((t - tStart) / span) * (plot.right - plot.left);
  const y = (b: number) => plot.bottom - ((b - lo) / (hi - lo)) * (plot.bottom - plot.top);
  const drawn = downsample(points, tStart, tEnd, Math.round(plot.right - plot.left));
  const line = drawn.map(([t, b], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(b).toFixed(1)}`).join('');
  const area = `${line}L${x(drawn[drawn.length - 1]![0]).toFixed(1)},${plot.bottom}L${x(drawn[0]![0]).toFixed(1)},${plot.bottom}Z`;
  const change = points[points.length - 1]![1] - points[0]![1];
  const color = change >= 0 ? '#7fe0a0' : '#f3998d';
  const fillId = `auto-report-fill-${size}`;
  const baseY = y(report.startBalance);
  const showBase = report.startBalance >= lo && report.startBalance <= hi;
  const yTicks = Array.from({ length: S.yTicks }, (_, i) => dataHi - ((dataHi - dataLo) * i) / Math.max(1, S.yTicks - 1));
  const xTicks = Array.from({ length: S.xTicks }, (_, i) => tStart + (span * i) / Math.max(1, S.xTicks - 1));

  let hovered: Point | undefined;
  if (hoverT !== null) {
    for (const p of points) if (!hovered || Math.abs(p[0] - hoverT) < Math.abs(hovered[0] - hoverT)) hovered = p;
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * S.W;
    setHoverT(tStart + ((vx - plot.left) / (plot.right - plot.left)) * span);
  };

  return (
    <svg ref={svgRef} className={`auto-report-chart ${size} ${onClick ? 'clickable' : ''}`} viewBox={`0 0 ${S.W} ${S.H}`} role="img"
      aria-label={`財產從 ${Math.round(points[0]![1])} 變成 ${Math.round(points[points.length - 1]![1])}`}
      style={{ fontSize: S.font }} onPointerMove={onMove} onPointerLeave={() => setHoverT(null)} onClick={onClick}>
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => (
        <g key={`y${i}`}>
          <line className="grid" x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)} />
          <text className="axis" x={plot.left - 6} y={y(v) + S.font * 0.35} textAnchor="end">{compact(v)}</text>
        </g>
      ))}
      {showBase && <>
        <line className="base" x1={plot.left} x2={plot.right} y1={baseY} y2={baseY} />
        <text className="axis base-label" x={plot.right} y={baseY - 4} textAnchor="end">起始</text>
      </>}
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={size === 'large' ? 2 : 1.8} strokeLinejoin="round" />
      {xTicks.map((t, i) => (
        <text key={`x${i}`} className="axis" x={x(t)} y={S.H - S.font * 0.5} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{formatDuration(t)}</text>
      ))}
      {hovered && (() => {
        const hx = x(hovered[0]);
        const hy = y(hovered[1]);
        const label = `${formatDuration(hovered[0])}（${clock(report.startedAt + hovered[0])}）  ${Math.round(hovered[1]).toLocaleString()}（${signed(hovered[1] - report.startBalance)}）`;
        const boxW = textWidth(label, S.font) + 12;
        const boxH = S.font + 8;
        const bx = Math.min(plot.right - boxW, Math.max(plot.left, hx - boxW / 2));
        return (
          <g className="hover">
            <line x1={hx} x2={hx} y1={plot.top} y2={plot.bottom} />
            <circle cx={hx} cy={hy} r={size === 'large' ? 4.5 : 3.5} fill={color} />
            <rect x={bx} y={plot.top} width={boxW} height={boxH} rx="4" />
            <text x={bx + 6} y={plot.top + boxH / 2 + S.font * 0.35}>{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
