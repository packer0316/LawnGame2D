import type { ContentSource } from '@lawn/engine';
import { docsStore } from '../state/docs';
import { readJson } from './projectFs';
import type { ProjectFs } from './projectFs';

/**
 * 給遊戲引擎用的內容來源：JSON 優先讀未匯出的草稿，其次讀 content/；
 * 圖片轉成 blob: URL（依修改時間快取，檔案更新後自動換新 URL）。
 */
export function projectContentSource(fs: ProjectFs): ContentSource & { revokeAll(): void } {
  const urls = new Map<string, { mtime: number | null; url: string }>();
  return {
    async json<T>(path: string): Promise<T> {
      const draft = docsStore.getState().docs[path];
      if (draft) return structuredClone(draft.data) as T;
      return readJson<T>(fs, `content/${path}`);
    },
    async imageUrl(path: string): Promise<string> {
      const full = `content/${path}`;
      const mtime = await fs.lastModified(full);
      const cached = urls.get(path);
      if (cached && cached.mtime === mtime) return cached.url;
      if (cached) URL.revokeObjectURL(cached.url);
      const url = URL.createObjectURL(await fs.readFile(full));
      urls.set(path, { mtime, url });
      return url;
    },
    revokeAll() {
      for (const { url } of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
