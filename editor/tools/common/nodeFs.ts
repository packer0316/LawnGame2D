/** Node 版 ProjectFs（CLI 工具用），與瀏覽器版共用同一套轉換、manifest 程式。 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { DirEntry, ProjectFs } from '../../src/fs/projectFs';

export function nodeFs(rootDir: string): ProjectFs {
  const root = resolve(rootDir);
  const full = (path: string) => {
    const p = resolve(root, path);
    if (p !== root && !p.startsWith(root + sep)) throw new Error(`路徑超出專案：${path}`);
    return p;
  };
  const notFound = (path: string, error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.assign(new Error(`找不到 ${path}`), { name: 'NotFoundError' });
    return error;
  };
  return {
    name: root.split(sep).pop() ?? 'project',
    exists: async (path) => (await stat(full(path)).catch(() => null))?.isFile() ?? false,
    async readText(path) {
      try {
        return await readFile(full(path), 'utf8');
      } catch (e) {
        throw notFound(path, e);
      }
    },
    async readFile(path) {
      try {
        return new Blob([await readFile(full(path))]);
      } catch (e) {
        throw notFound(path, e);
      }
    },
    lastModified: async (path) => (await stat(full(path)).catch(() => null))?.mtimeMs ?? null,
    async list(dir) {
      const entries = await readdir(full(dir), { withFileTypes: true }).catch(() => []);
      return entries
        .map((e): DirEntry => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async writeText(path, text) {
      await mkdir(dirname(full(path)), { recursive: true });
      await writeFile(full(path), text, 'utf8');
    },
    async writeFile(path, data) {
      await mkdir(dirname(full(path)), { recursive: true });
      await writeFile(full(path), new Uint8Array(await data.arrayBuffer()));
    },
    remove: async (path) => rm(full(path), { force: true }),
  };
}

/** 從目前目錄往上找專案根目錄（有 doc/ 或同時有 game/ 與 editor/）。 */
export async function findProjectRoot(start = process.cwd()): Promise<string> {
  let dir = resolve(start);
  for (;;) {
    const names = new Set((await readdir(dir).catch(() => [])) as string[]);
    if (names.has('content') || names.has('doc') || (names.has('game') && names.has('editor'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('找不到專案根目錄，請用 --project 指定');
    dir = parent;
  }
}

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
