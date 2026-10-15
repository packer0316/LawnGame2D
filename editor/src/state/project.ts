/** 開啟專案資料夾、還原草稿、記住上次的專案。 */
import { projectContentSource } from '../fs/contentSource';
import { idb } from '../fs/idb';
import { directoryFs, isNotFound, readJson } from '../fs/projectFs';
import type { ProjectFs } from '../fs/projectFs';
import { getDoc, loadDoc, resetDocs } from './docs';
import type { DocEntry } from './docs';
import { loadDrafts, startDraftAutosave } from './drafts';
import { setStatus, useStudio } from './studio';
import { forgetMtimes, rememberMtime, startContentWatch } from './watch';

const LAST_PROJECT = 'lastProject';
let stopAutosave: (() => void) | null = null;
let stopWatch: (() => void) | null = null;

export function isFsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** 檢查選到的是不是專案根目錄（要有 doc/、game/ 或 content/ 其中之一）。 */
async function looksLikeProjectRoot(fs: ProjectFs): Promise<boolean> {
  const names = new Set((await fs.list('')).map((e) => e.name));
  return names.has('content') || names.has('doc') || (names.has('game') && names.has('editor'));
}

export async function pickProject(): Promise<void> {
  if (!window.showDirectoryPicker) throw new Error('這個瀏覽器不支援 File System Access API，請使用 Chrome 或 Edge');
  const handle = await window.showDirectoryPicker({ id: 'lawnstudio-project', mode: 'readwrite' });
  await openProject(handle);
}

export async function openProject(handle: FileSystemDirectoryHandle): Promise<void> {
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new Error('沒有取得資料夾的讀寫權限');
    }
  }
  await openProjectFs(directoryFs(handle));
  await idb.set(LAST_PROJECT, handle);
}

/** 開發用：網址加 ?devfs 時，透過 vite dev 的 HTTP API 開啟專案（自動化測試用）。 */
export async function openDevProject(): Promise<void> {
  const { httpFs } = await import('../fs/httpFs');
  await openProjectFs(await httpFs());
}

async function openProjectFs(fs: ProjectFs): Promise<void> {
  if (!(await looksLikeProjectRoot(fs))) {
    throw new Error(`「${fs.name}」看起來不是 LawnGame2D 專案根目錄（應包含 content/、doc/ 或 game/ 與 editor/）`);
  }

  stopAutosave?.();
  stopWatch?.();
  forgetMtimes();
  useStudio.getState().content?.revokeAll();
  resetDocs();

  // 還原草稿：草稿的文件一律先載入（磁碟版本當作 saved）
  const drafts = await loadDrafts(fs.name);
  for (const [path, draft] of drafts) {
    let saved: unknown;
    try {
      saved = await readJson(fs, `content/${path}`);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    loadDoc(path, saved, draft.data);
    await rememberMtime(fs, path);
  }

  useStudio.setState({ fs, content: projectContentSource(fs), issues: [] });
  stopAutosave = startDraftAutosave(fs.name);
  stopWatch = startContentWatch(fs);
  setStatus(
    drafts.size > 0 ? `已開啟 ${fs.name}，還原了 ${drafts.size} 份未匯出的草稿` : `已開啟 ${fs.name}`,
    'ok',
  );
}

/** 上次開啟的專案；權限已授予時直接開啟並回傳 null，否則回傳 handle 讓使用者按按鈕重新授權。 */
export async function restoreLastProject(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idb.get<FileSystemDirectoryHandle>(LAST_PROJECT).catch(() => undefined);
  if (!handle) return null;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
    await openProject(handle);
    return null;
  }
  return handle;
}

/**
 * 確保文件已載入：已在草稿中就直接回傳，否則從 content/ 讀取（不存在時為 undefined）。
 * parse 用來驗證／升級舊版資料（例如 XxxFile.migrate）。
 */
export async function ensureDoc<T>(
  path: string,
  parse: (raw: unknown) => T = (raw) => raw as T,
): Promise<DocEntry<T> | undefined> {
  const existing = getDoc<T>(path);
  if (existing) return existing;
  const fs = useStudio.getState().fs;
  if (!fs) return undefined;
  try {
    loadDoc(path, parse(await readJson(fs, `content/${path}`)));
    await rememberMtime(fs, path);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
  return getDoc<T>(path);
}
