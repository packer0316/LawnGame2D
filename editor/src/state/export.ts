/**
 * 匯出：把有修改的文件寫進 content/，刪除被刪掉的文件，複製待匯出的素材，最後重建 manifest.json。
 * 有驗證錯誤時不匯出。
 */
import { contentPaths } from '@lawn/shared';
import { buildManifest } from '../content/manifest';
import { writeJson } from '../fs/projectFs';
import type { ProjectFs } from '../fs/projectFs';
import { deletedPaths, dirtyPaths, docsStore, markSaved } from './docs';
import { runValidators } from './validation';
import { rememberMtime } from './watch';
import type { Issue } from './validation';

/** 要一併匯出的二進位素材（例如從 art/ 複製 tileset 圖）：content/ 路徑 → 產生 Blob 的函式。 */
export const pendingAssets = new Map<string, () => Promise<Blob>>();

/** 驗證通過後、寫檔前執行（例如重新產生部件圖示）。 */
const exportHooks = new Map<string, (fs: ProjectFs) => Promise<void>>();
export function registerExportHook(name: string, hook: (fs: ProjectFs) => Promise<void>): void {
  exportHooks.set(name, hook);
}

export interface ExportReport {
  ok: boolean;
  issues: Issue[];
  written: string[];
  deleted: string[];
  assets: string[];
}

export async function exportAll(fs: ProjectFs): Promise<ExportReport> {
  const issues = await runValidators({ fs, docs: docsStore.getState().docs });
  if (issues.some((i) => i.severity === 'error')) {
    return { ok: false, issues, written: [], deleted: [], assets: [] };
  }

  for (const hook of exportHooks.values()) await hook(fs);

  const written: string[] = [];
  for (const path of dirtyPaths()) {
    const entry = docsStore.getState().docs[path];
    if (!entry) continue;
    await writeJson(fs, `content/${path}`, entry.data);
    markSaved(path);
    await rememberMtime(fs, path);
    written.push(path);
  }

  const deleted: string[] = [];
  for (const path of [...deletedPaths]) {
    if (docsStore.getState().docs[path]) continue;
    await fs.remove(`content/${path}`);
    deletedPaths.delete(path);
    deleted.push(path);
  }

  const assets: string[] = [];
  for (const [path, make] of pendingAssets) {
    await fs.writeFile(`content/${path}`, await make());
    pendingAssets.delete(path);
    assets.push(path);
  }

  await writeJson(fs, `content/${contentPaths.manifest}`, await buildManifest(fs));
  return { ok: true, issues, written, deleted, assets };
}
