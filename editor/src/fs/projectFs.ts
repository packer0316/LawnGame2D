/**
 * 專案檔案存取。路徑一律相對專案根目錄、用 `/`，例：`content/maps/map_0001.json`、`art/maps/world.ldtk`。
 * 瀏覽器用 File System Access API（directoryFs）；測試用 memoryFs。
 */

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface ProjectFs {
  readonly name: string;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readFile(path: string): Promise<Blob>;
  /** 檔案最後修改時間；檔案不存在時回傳 null。 */
  lastModified(path: string): Promise<number | null>;
  list(dir: string): Promise<DirEntry[]>;
  writeText(path: string, text: string): Promise<void>;
  writeFile(path: string, data: Blob): Promise<void>;
  remove(path: string): Promise<void>;
}

export async function readJson<T = unknown>(fs: ProjectFs, path: string): Promise<T> {
  const text = await fs.readText(path);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${path} 不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 寫 JSON：2 空白縮排、結尾換行，讓 git diff 好讀。 */
export function writeJson(fs: ProjectFs, path: string, data: unknown): Promise<void> {
  return fs.writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function splitPath(path: string): string[] {
  return path.split('/').filter((p) => p !== '' && p !== '.');
}

export function joinPath(...parts: string[]): string {
  const out: string[] = [];
  for (const part of parts.flatMap(splitPath)) {
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export function dirname(path: string): string {
  const parts = splitPath(path);
  parts.pop();
  return parts.join('/');
}

export function basename(path: string): string {
  return splitPath(path).pop() ?? '';
}

class NotFoundError extends Error {
  constructor(path: string) {
    super(`找不到 ${path}`);
    this.name = 'NotFoundError';
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotFoundError';
}

/** File System Access API 版本。 */
export function directoryFs(root: FileSystemDirectoryHandle): ProjectFs {
  async function dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let handle = root;
    for (const part of parts) {
      try {
        handle = await handle.getDirectoryHandle(part, { create });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') throw new NotFoundError(parts.join('/'));
        throw error;
      }
    }
    return handle;
  }

  async function file(path: string, create = false): Promise<FileSystemFileHandle> {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) throw new Error(`路徑不正確：${path}`);
    const parent = await dir(parts, create);
    try {
      return await parent.getFileHandle(name, { create });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async function write(path: string, data: Blob | string): Promise<void> {
    const handle = await file(path, true);
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  return {
    name: root.name,
    async exists(path) {
      try {
        await file(path);
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async readText(path) {
      return (await (await file(path)).getFile()).text();
    },
    async readFile(path) {
      return (await file(path)).getFile();
    },
    async lastModified(path) {
      try {
        return (await (await file(path)).getFile()).lastModified;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async list(path) {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await dir(splitPath(path), false);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      const entries: DirEntry[] = [];
      for await (const [name, child] of handle.entries()) entries.push({ name, kind: child.kind });
      return entries.sort((a, b) => a.name.localeCompare(b.name));
    },
    writeText: write,
    writeFile: write,
    async remove(path) {
      const parts = splitPath(path);
      const name = parts.pop();
      if (!name) return;
      try {
        await (await dir(parts, false)).removeEntry(name);
      } catch (error) {
        if (!isNotFound(error) && !(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
    },
  };
}

/** 記憶體版本（測試用）。 */
export function memoryFs(initial: Record<string, string | Blob> = {}, name = 'memory'): ProjectFs & {
  files: Map<string, { data: Blob; mtime: number }>;
} {
  let clock = 1;
  const files = new Map<string, { data: Blob; mtime: number }>();
  const put = (path: string, data: string | Blob) =>
    files.set(joinPath(path), { data: typeof data === 'string' ? new Blob([data]) : data, mtime: clock++ });
  for (const [path, data] of Object.entries(initial)) put(path, data);

  const get = (path: string) => {
    const entry = files.get(joinPath(path));
    if (!entry) throw new NotFoundError(path);
    return entry;
  };

  return {
    name,
    files,
    exists: async (path) => files.has(joinPath(path)),
    readText: async (path) => get(path).data.text(),
    readFile: async (path) => get(path).data,
    lastModified: async (path) => files.get(joinPath(path))?.mtime ?? null,
    async list(dir) {
      const prefix = joinPath(dir);
      const seen = new Map<string, DirEntry['kind']>();
      for (const path of files.keys()) {
        if (prefix && !path.startsWith(`${prefix}/`)) continue;
        const rest = prefix ? path.slice(prefix.length + 1) : path;
        const [head, ...tail] = rest.split('/');
        if (head) seen.set(head, tail.length > 0 ? 'directory' : 'file');
      }
      return [...seen].map(([name, kind]) => ({ name, kind })).sort((a, b) => a.name.localeCompare(b.name));
    },
    writeText: async (path, text) => void put(path, text),
    writeFile: async (path, data) => void put(path, data),
    remove: async (path) => void files.delete(joinPath(path)),
  };
}
