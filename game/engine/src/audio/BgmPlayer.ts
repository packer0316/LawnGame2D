import { contentPaths } from '@lawn/shared';
import type { ContentSource } from '../content';

/** 找不到曲子（例如地圖寫的 bgm_cave 沒有檔案）時改播這首 */
export const FALLBACK_BGM = 'bgm_forest';
/** 背景音樂音量（0–1），比技能音效小聲 */
const VOLUME = 0.4;
const FADE_OUT_MS = 700;
const FADE_IN_MS = 1200;
const TICK_MS = 50;

interface Track {
  id: string;
  audio: HTMLAudioElement;
  /** 目前音量比例（0–1） */
  level: number;
  /** 淡到哪裡：1 = 播放中，0 = 淡出後移除 */
  goal: 0 | 1;
}

/**
 * 背景音樂（SPEC §4.6）：進房播放 room.bgm ?? map.bgm，循環；換房時舊曲淡出、新曲淡入，同一首不重播。
 * 用 HTMLAudioElement 串流，不必把整首 mp3 解碼進記憶體。
 * 瀏覽器要使用者先互動才能出聲：被擋下時等第一次點擊或按鍵再開始播。分頁切到背景時暫停。
 */
export class BgmPlayer {
  private tracks: Track[] = [];
  /** 現在該播的曲子（換曲時同步更新，載入中的舊請求看到不一樣就放棄） */
  private wanted: string | null = null;
  /** 讀不到的曲子：之後直接用預設曲，不再嘗試 */
  private readonly missing = new Set<string>();
  private timer: number | null = null;
  private disposed = false;
  private readonly unlock = () => this.resume();
  private readonly onVisibility = () => (document.hidden ? this.pauseAll() : this.resume());

  constructor(private readonly source: ContentSource) {
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get current(): string | null {
    return this.wanted;
  }

  play(id: string | undefined): void {
    const next = id && !this.missing.has(id) ? id : FALLBACK_BGM;
    if (this.disposed || next === this.wanted) return;
    this.wanted = next;
    void this.start(next);
  }

  destroy(): void {
    this.disposed = true;
    this.removeUnlock();
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const t of this.tracks) release(t);
    this.tracks = [];
  }

  /** 先載入新曲，確定讀得到才換（舊曲淡出、新曲淡入）；讀不到就記下來，改播預設曲 */
  private async start(id: string): Promise<void> {
    // 正在淡出的同一首：拉回來就好
    const existing = this.tracks.find((t) => t.id === id);
    if (existing) {
      this.switchTo(existing);
      return;
    }
    // 編輯器的內容來源讀不到檔案時直接丟錯
    const url = await this.source.imageUrl(contentPaths.bgm(id)).catch(() => null);
    if (this.disposed || id !== this.wanted) return;
    if (url === null) return this.fail(id);
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    const track: Track = { id, audio, level: 0, goal: 1 };
    audio.addEventListener(
      'canplay',
      () => {
        if (this.disposed || id !== this.wanted) return release(track);
        this.switchTo(track);
        this.tryPlay(track);
      },
      { once: true },
    );
    audio.addEventListener(
      'error',
      () => {
        // 已經換成別首或已移除的曲子不理（release() 清掉 src 也可能觸發 error）
        if (this.tracks.includes(track) || this.disposed || id !== this.wanted) return;
        release(track);
        this.fail(id);
      },
      { once: true },
    );
    audio.src = url;
  }

  /** 讀不到：記下來，改播預設曲（預設曲也讀不到就不播） */
  private fail(id: string): void {
    this.missing.add(id);
    console.warn(`找不到背景音樂 ${id}，改播 ${FALLBACK_BGM}`);
    if (id === FALLBACK_BGM) return;
    this.wanted = FALLBACK_BGM;
    void this.start(FALLBACK_BGM);
  }

  private switchTo(track: Track): void {
    for (const t of this.tracks) t.goal = t === track ? 1 : 0;
    if (!this.tracks.includes(track)) this.tracks.push(track);
    this.ensureTimer();
  }

  private tryPlay(track: Track): void {
    if (document.hidden) return;
    // 被擋下（還沒有使用者互動）就留著，等 unlock 再試；播得出來代表頁面已解鎖，不必再聽
    track.audio.play().then(() => this.removeUnlock(), () => {});
  }

  private resume(): void {
    if (this.disposed || document.hidden) return;
    for (const t of this.tracks) if (t.goal > 0 && t.audio.paused) this.tryPlay(t);
  }

  private pauseAll(): void {
    for (const t of this.tracks) t.audio.pause();
  }

  private removeUnlock(): void {
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
  }

  private ensureTimer(): void {
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** 淡入淡出。還沒開始播（被瀏覽器擋下、分頁在背景）的新曲不前進，沒在播的舊曲直接移除。 */
  private tick(): void {
    this.tracks = this.tracks.filter((t) => {
      if (t.audio.paused) {
        if (t.goal > 0) return true;
        release(t);
        return false;
      }
      const ms = t.goal > t.level ? FADE_IN_MS : FADE_OUT_MS;
      const step = TICK_MS / ms;
      t.level = t.goal > t.level ? Math.min(1, t.level + step) : Math.max(0, t.level - step);
      t.audio.volume = VOLUME * t.level;
      if (t.goal === 0 && t.level === 0) {
        release(t);
        return false;
      }
      return true;
    });
    if (this.tracks.every((t) => t.level === t.goal) && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function release(t: Track): void {
  t.audio.pause();
  t.audio.removeAttribute('src');
  t.audio.load();
}
