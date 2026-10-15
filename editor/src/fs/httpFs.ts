/** 開發用的 ProjectFs：透過 vite dev 的 /__devfs API 存取專案（見 tools/devfs）。 */
import type { DirEntry, ProjectFs } from './projectFs';

export async function httpFs(base = '/__devfs'): Promise<ProjectFs> {
  const q = (path: string) => `?path=${encodeURIComponent(path)}`;
  const notFound = (path: string) => Object.assign(new Error(`找不到 ${path}`), { name: 'NotFoundError' });
  const read = async (path: string) => {
    const res = await fetch(`${base}/read${q(path)}`);
    if (res.status === 404) throw notFound(path);
    if (!res.ok) throw new Error(`讀取 ${path} 失敗：${res.status}`);
    return res.blob();
  };
  const write = async (path: string, body: Blob | string) => {
    const res = await fetch(`${base}/write${q(path)}`, { method: 'PUT', body });
    if (!res.ok) throw new Error(`寫入 ${path} 失敗：${await res.text()}`);
  };
  const info = (await (await fetch(`${base}/info`)).json()) as { name: string };
  return {
    name: info.name,
    exists: async (path) => (await (await fetch(`${base}/stat${q(path)}`)).json()) !== null,
    readText: async (path) => (await read(path)).text(),
    readFile: read,
    lastModified: async (path) => ((await (await fetch(`${base}/stat${q(path)}`)).json()) as { mtime: number } | null)?.mtime ?? null,
    list: async (dir) => ((await (await fetch(`${base}/list${q(dir)}`)).json()) as DirEntry[]).sort((a, b) => a.name.localeCompare(b.name)),
    writeText: write,
    writeFile: write,
    remove: async (path) => {
      const res = await fetch(`${base}/remove${q(path)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`刪除 ${path} 失敗：${await res.text()}`);
    },
  };
}
