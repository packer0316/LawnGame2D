import { SFX_CUES, type SfxLayer } from './sfxCues';

const URLS = import.meta.glob('../../../assets/sfx/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 素材名稱 → 網址 */
export const SFX_SAMPLES = new Map(Object.entries(URLS).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length), url]));

const VOLUME_KEY = 'lawn.sfxVolume';
const MAX_VOICES = 48;
/** 同一個素材這麼短的時間內再觸發就略過：一刀打中十隻怪不會疊出十倍音量 */
const RETRIGGER_MS = 25;
const DEFAULT_JITTER = 0.04;

export interface SfxPlayOptions {
  /** 世界座標 x：依離鏡頭中心的距離分左右聲道，畫面外的小聲一點 */
  x?: number;
  /** 整組音量（dB） */
  gain?: number;
  /** 整組播放速度（同時改變音高） */
  rate?: number;
  /** 多段技能：這是第幾刀、共幾刀（給 SfxLayer.when） */
  index?: number;
  count?: number;
}

/**
 * 音效引擎（SPEC §4.5）：Web Audio 播放 assets/sfx 的素材，照 sfxCues 的組合把好幾層依時間差疊起來。
 * 全頁共用一個（遊戲與 HUD 按鈕都用 `sfx`）。瀏覽器要先有使用者互動才能出聲：第一次點擊或按鍵時建立 AudioContext 並載入全部素材。
 */
class SfxEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading = false;
  private readonly lastStart = new Map<string, number>();
  private voices = 0;
  private volume = readVolume();
  /** 鏡頭中心與半寬（世界座標），給左右聲道用；遊戲場景設定 */
  listener: (() => { x: number; halfWidth: number }) | null = null;
  /** 測試用：每次播放一組音效時呼叫（開發伺服器下可從 window.__lawnSfx 設定） */
  onPlay: ((name: string) => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    if (import.meta.env?.DEV) (window as unknown as { __lawnSfx?: SfxEngine }).__lawnSfx = this;
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      void (document.hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => undefined);
    });
  }

  get ready(): boolean {
    return this.ctx?.state === 'running' && this.buffers.size > 0;
  }

  getVolume(): number {
    return this.volume;
  }

  /** 0–1，存在 localStorage */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* 無痕模式等存不了 */
    }
    if (this.out) this.out.gain.value = this.volume;
  }

  has(name: string): boolean {
    return name in SFX_CUES;
  }

  /** 播放一組音效；沒有這組或還沒解鎖時回傳 false。 */
  play(name: string, opts: SfxPlayOptions = {}): boolean {
    const cue = SFX_CUES[name];
    if (!cue) return false;
    this.onPlay?.(name);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.volume <= 0) return true;
    const index = opts.index ?? 0;
    const count = opts.count ?? 1;
    const { pan, attenuation } = this.spatial(opts.x);
    for (const layer of cue) {
      if (!matchesWhen(layer, index, count)) continue;
      this.start(ctx, layer, pan, (opts.gain ?? 0) + attenuation, opts.rate ?? 1);
    }
    return true;
  }

  /** 依序找第一組有定義的音效播放（例如 `hit:<技能>` 沒有就用 `hit:<職業>`）。 */
  playFirst(names: readonly string[], opts?: SfxPlayOptions): string | null {
    for (const name of names) if (this.play(name, opts)) return name;
    return null;
  }

  private start(ctx: AudioContext, layer: SfxLayer, pan: number, gainDb: number, rate: number): void {
    const name = typeof layer.s === 'string' ? layer.s : layer.s[Math.floor(Math.random() * layer.s.length)]!;
    const buffer = this.buffers.get(name);
    if (!buffer || this.voices >= MAX_VOICES) return;
    const when = ctx.currentTime + (layer.at ?? 0) / 1000;
    const last = this.lastStart.get(name);
    if (last !== undefined && Math.abs(when - last) < RETRIGGER_MS / 1000) return;
    this.lastStart.set(name, when);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const jitter = layer.jitter ?? DEFAULT_JITTER;
    source.playbackRate.value = (layer.rate ?? 1) * rate * (1 + (Math.random() * 2 - 1) * jitter);
    const gain = ctx.createGain();
    gain.gain.value = 10 ** (((layer.gain ?? 0) + gainDb) / 20);
    let node: AudioNode = source.connect(gain);
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      node = node.connect(panner);
    }
    node.connect(this.out!);
    this.voices += 1;
    source.onended = () => {
      this.voices -= 1;
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
  }

  private spatial(x: number | undefined): { pan: number; attenuation: number } {
    const view = this.listener?.();
    if (x === undefined || !view || view.halfWidth <= 0) return { pan: 0, attenuation: 0 };
    const d = (x - view.x) / view.halfWidth;
    const pan = Math.max(-0.75, Math.min(0.75, d * 0.6));
    const attenuation = Math.abs(d) > 1 ? -Math.min(12, (Math.abs(d) - 1) * 8) : 0;
    return { pan, attenuation };
  }

  private readonly unlock = (): void => {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      // 很多層同時響時壓住峰值，不爆音
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(comp);
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => undefined);
    if (!this.loading) {
      this.loading = true;
      void this.loadAll(this.ctx);
    }
  };

  private async loadAll(ctx: AudioContext): Promise<void> {
    const entries = [...SFX_SAMPLES];
    // 同時最多 8 個下載＋解碼
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const [name, url] = entries[next++]!;
        try {
          const data = await (await fetch(url)).arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch {
          /* 單一素材壞掉就少一層，不影響其他 */
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }
}

function matchesWhen(layer: SfxLayer, index: number, count: number): boolean {
  switch (layer.when) {
    case 'first':
      return index === 0;
    case 'last':
      return index === count - 1;
    case 'notLast':
      return index < count - 1;
    default:
      return true;
  }
}

/** 沒存過音量時的預設（使用者指定 50%） */
const DEFAULT_VOLUME = 0.5;

function readVolume(): number {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VOLUME_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export const sfx = new SfxEngine();
