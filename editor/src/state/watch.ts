/**
 * 監看 content/ 的變動（STUDIO_SPEC §2：Aseprite 重新匯出、或在外部改了檔案時自動重新載入）。
 * - 沒有草稿的文件：直接重新讀入。
 * - 有草稿的文件：保留草稿，在狀態列提示外部有修改（匯出時會覆蓋外部的修改）。
 * - 資料夾內容（新匯出的 sheet、圖片更新）：遞增 contentVersion，各頁面據此重新掃描與重新載圖。
 */
import { isNotFound, readJson } from '../fs/projectFs';
import type { ProjectFs } from '../fs/projectFs';
import { docsStore, isDirty, loadDoc } from './docs';
import { setStatus, useStudio } from './studio';

const docMtimes = new Map<string, number | null>();

/** 記下文件在磁碟上的修改時間（讀入或匯出後呼叫）。 */
export async function rememberMtime(fs: ProjectFs, path: string): Promise<void> {
  docMtimes.set(path, await fs.lastModified(`content/${path}`));
}

export function forgetMtimes(): void {
  docMtimes.clear();
}

const WATCHED_DIRS = ['content/monsters', 'content/avatar', 'content/avatar/items', 'content/fx', 'content/tilesets', 'content/backgrounds'];

async function dirSignature(fs: ProjectFs): Promise<string> {
  const parts: string[] = [];
  for (const dir of WATCHED_DIRS) {
    for (const e of await fs.list(dir)) {
      if (e.kind !== 'file') continue;
      if (!e.name.endsWith('.png') && !e.name.endsWith('.sheet.json')) continue;
      parts.push(`${dir}/${e.name}:${await fs.lastModified(`${dir}/${e.name}`)}`);
    }
  }
  return parts.join('|');
}

/** 開始監看，回傳停止函式。 */
export function startContentWatch(fs: ProjectFs, intervalMs = 2000): () => void {
  let busy = false;
  let signature: string | null = null;
  const warned = new Set<string>();
  const timer = setInterval(async () => {
    if (busy || useStudio.getState().fs !== fs) return;
    busy = true;
    try {
      const reloaded: string[] = [];
      for (const [path, known] of docMtimes) {
        const mtime = await fs.lastModified(`content/${path}`);
        if (mtime === known) continue;
        const entry = docsStore.getState().docs[path];
        if (entry && isDirty(entry)) {
          if (!warned.has(path)) {
            warned.add(path);
            setStatus(`content/${path} 在外部被修改了；你有未匯出的草稿，匯出時會覆蓋外部的修改`, 'error');
          }
          continue;
        }
        docMtimes.set(path, mtime);
        warned.delete(path);
        if (mtime === null) continue;
        try {
          const data = await readJson(fs, `content/${path}`);
          loadDoc(path, data);
          reloaded.push(path);
        } catch (error) {
          if (!isNotFound(error)) setStatus(`重新載入 ${path} 失敗：${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }
      const sig = await dirSignature(fs);
      const changedAssets = signature !== null && sig !== signature;
      signature = sig;
      if (changedAssets) useStudio.setState((s) => ({ contentVersion: s.contentVersion + 1 }));
      if (reloaded.length || changedAssets) {
        setStatus(`偵測到 content/ 更新，已重新載入${reloaded.length ? `：${reloaded.slice(0, 3).join('、')}${reloaded.length > 3 ? ` 等 ${reloaded.length} 個` : ''}` : '素材'}`, 'ok');
      }
    } finally {
      busy = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
