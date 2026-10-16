/**
 * 掛機紀錄（SPEC §3.6）：一次自動冒險從開始到停止的財產變化與掉落。
 * 停止後保留到下一次開始，也存在瀏覽器裡（重新整理還看得到）。
 */

/** 同一種掉落合併成一行（×N），times 是每次拿到的時間（Date.now()）。 */
export interface AutoReportItem {
  kind: 'weapon' | 'scroll';
  name: string;
  /** 武器 definitionId 或 `scroll-10` 等（HUD 用來找圖）；舊紀錄可能沒有 */
  id?: string;
  count: number;
  times: number[];
}

export interface AutoReport {
  running: boolean;
  /** 開始時間（Date.now()） */
  startedAt: number;
  endedAt?: number;
  stopReason?: string;
  startBalance: number;
  balance: number;
  high: number;
  low: number;
  /** 財產曲線：[開始後毫秒, 財產]；掛機中最後一點是現在 */
  points: [number, number][];
  items: AutoReportItem[];
}

/** HUD 用：紀錄加上到現在（或停止時）的掛機時間。 */
export type AutoReportView = AutoReport & { elapsedMs: number };

const STORAGE_KEY = 'lawn.autoReport';
const SAMPLE_MS = 1000;
/** 6 小時內每秒一點（放大看近 1 分鐘也清楚）；超過就隔一點丟一點、取樣間隔加倍。畫圖時再依寬度抽樣 */
const MAX_POINTS = 21_600;
const SAVE_EVERY_MS = 15_000;

export class AutoReportRecorder {
  private report: AutoReport | null;
  private step = SAMPLE_MS;
  private version = 0;
  private cached: { version: number; report: AutoReport } | null = null;
  private savedAt = 0;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.report = load(storage);
    if (this.report) this.step = stepFor(this.report.points);
  }

  get running(): boolean {
    return this.report?.running ?? false;
  }

  start(balance: number, now = Date.now()): void {
    this.report = { running: true, startedAt: now, startBalance: balance, balance, high: balance, low: balance, points: [[0, balance]], items: [] };
    this.step = SAMPLE_MS;
    this.changed(now, true);
  }

  /** 每次 HUD 更新時呼叫；每 step 毫秒記一點。 */
  sample(balance: number, now = Date.now()): void {
    const r = this.report;
    if (!r?.running) return;
    this.track(r, balance);
    const t = now - r.startedAt;
    const last = r.points[r.points.length - 1];
    if (last && t - last[0] < this.step) return;
    r.points.push([t, balance]);
    if (r.points.length > MAX_POINTS) {
      const kept = r.points.filter((_, i) => i % 2 === 0);
      if (kept[kept.length - 1] !== r.points[r.points.length - 1]) kept.push(r.points[r.points.length - 1]!);
      r.points = kept;
      this.step *= 2;
    }
    this.changed(now, now - this.savedAt >= SAVE_EVERY_MS);
  }

  item(kind: AutoReportItem['kind'], name: string, id?: string, now = Date.now()): void {
    const r = this.report;
    if (!r?.running) return;
    const same = r.items.find((i) => i.kind === kind && (id !== undefined && i.id !== undefined ? i.id === id : i.name === name));
    if (same) {
      same.count++;
      same.times.push(now);
    } else r.items.push({ kind, name, ...(id !== undefined ? { id } : {}), count: 1, times: [now] });
    this.changed(now, true);
  }

  /** 手動改金錢、清空重置：整條曲線跟著平移，不算成輸贏。 */
  shift(delta: number): void {
    const r = this.report;
    if (!r?.running || delta === 0) return;
    r.startBalance += delta;
    r.balance += delta;
    r.high += delta;
    r.low += delta;
    for (const p of r.points) p[1] += delta;
    this.changed(Date.now(), true);
  }

  stop(balance: number, reason: string, now = Date.now()): void {
    const r = this.report;
    if (!r?.running) return;
    this.track(r, balance);
    r.points.push([now - r.startedAt, balance]);
    r.running = false;
    r.endedAt = now;
    r.stopReason = reason;
    this.changed(now, true);
  }

  /** 給 HUD：沒變的時候回傳同一份（避免每 100ms 複製整條曲線）。 */
  view(now = Date.now()): AutoReportView | undefined {
    const r = this.report;
    if (!r) return undefined;
    if (this.cached?.version !== this.version) {
      // 曲線只會往後加（平移時才改舊點），淺拷貝就夠
      this.cached = { version: this.version, report: { ...r, points: r.points.slice(), items: r.items.map((i) => ({ ...i, times: [...i.times] })) } };
    }
    const report = this.cached.report;
    const elapsedMs = Math.max(0, (r.running ? now : (r.endedAt ?? now)) - r.startedAt);
    if (!r.running) return { ...report, elapsedMs };
    // 掛機中：曲線最後接上現在的財產
    return { ...report, balance: r.balance, high: r.high, low: r.low, points: [...report.points, [elapsedMs, r.balance]], elapsedMs };
  }

  private track(r: AutoReport, balance: number): void {
    r.balance = balance;
    if (balance > r.high) r.high = balance;
    if (balance < r.low) r.low = balance;
  }

  private changed(now: number, save: boolean): void {
    this.version++;
    if (!save || !this.storage || !this.report) return;
    this.savedAt = now;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.report));
    } catch {
      // 無痕模式等情況存不了，只留在記憶體
    }
  }
}

/** 讀回上次的紀錄；存的時候還在掛機（頁面直接關掉）就當成在最後一點停止。 */
function load(storage: Pick<Storage, 'getItem'> | null): AutoReport | null {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as AutoReport | null;
    if (!raw || typeof raw.startedAt !== 'number' || !Array.isArray(raw.points) || !Array.isArray(raw.items)) return null;
    if (raw.running) {
      raw.running = false;
      raw.endedAt = raw.startedAt + (raw.points[raw.points.length - 1]?.[0] ?? 0);
      raw.stopReason = '頁面已關閉';
    }
    return raw;
  } catch {
    return null;
  }
}

function stepFor(points: [number, number][]): number {
  let step = SAMPLE_MS;
  while ((points[points.length - 1]?.[0] ?? 0) / step > MAX_POINTS) step *= 2;
  return step;
}
