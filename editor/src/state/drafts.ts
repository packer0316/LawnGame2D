/**
 * 自動存草稿：有修改的文件每秒寫進 IndexedDB；下次開啟同一個專案時還原。
 * 草稿不寫入 content/（STUDIO_SPEC §3）。
 */
import { idb } from '../fs/idb';
import { docsStore, isDirty } from './docs';

const SAVE_DELAY_MS = 1000;

const key = (project: string, path: string) => `draft:${project}:${path}`;

export interface StoredDraft {
  data: unknown;
  savedAt: number;
}

/** 開始自動存草稿，回傳停止函式。 */
export function startDraftAutosave(project: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastDocs = docsStore.getState().docs;

  const flush = async () => {
    const docs = docsStore.getState().docs;
    const stored = new Set(await idb.keys(`draft:${project}:`));
    for (const entry of Object.values(docs)) {
      const k = key(project, entry.path);
      if (isDirty(entry)) await idb.set(k, { data: entry.data, savedAt: Date.now() } satisfies StoredDraft);
      else if (stored.has(k)) await idb.del(k);
      stored.delete(k);
    }
    // 已不存在的文件（被刪除或復原掉的新檔）
    for (const k of stored) await idb.del(k);
  };

  const unsubscribe = docsStore.subscribe((state) => {
    if (state.docs === lastDocs) return;
    lastDocs = state.docs;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

/** 讀出某專案所有草稿：content/ 路徑 → 草稿。 */
export async function loadDrafts(project: string): Promise<Map<string, StoredDraft>> {
  const prefix = `draft:${project}:`;
  const result = new Map<string, StoredDraft>();
  for (const k of await idb.keys(prefix)) {
    const draft = await idb.get<StoredDraft>(k);
    if (draft) result.set(k.slice(prefix.length), draft);
  }
  return result;
}

export async function clearDrafts(project: string): Promise<void> {
  for (const k of await idb.keys(`draft:${project}:`)) await idb.del(k);
}
