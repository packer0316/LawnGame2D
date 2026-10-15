/**
 * 開發用：讓編輯器在沒有 File System Access API 的情況下（自動化測試、無頭瀏覽器）存取專案資料夾。
 * 只在 `vite dev` 啟用；網址加上 `?devfs` 時編輯器改用這組 HTTP API。
 * 依 COLLAB 的資料夾歸屬，只允許寫入 content/。
 * 專案根目錄預設是 editor/ 的上一層，可用環境變數 LAWN_PROJECT_ROOT 指定（例如測試用的暫存專案）。
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const WRITABLE = ['content/'];

export function devFsPlugin(defaultRoot: string): Plugin {
  const root = resolve(process.env.LAWN_PROJECT_ROOT ?? defaultRoot);
  const safe = (path: string) => {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`路徑超出專案：${path}`);
    return full;
  };
  return {
    name: 'lawnstudio-devfs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__devfs', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const path = url.searchParams.get('path') ?? '';
        const send = (status: number, body: string | Buffer, type = 'application/json') => {
          res.statusCode = status;
          res.setHeader('content-type', type);
          res.end(body);
        };
        try {
          const full = safe(path);
          switch (`${req.method} ${url.pathname}`) {
            case 'GET /info':
              return send(200, JSON.stringify({ name: root.split(sep).pop() ?? 'project' }));
            case 'GET /list': {
              const entries = await readdir(full, { withFileTypes: true }).catch(() => []);
              return send(200, JSON.stringify(entries.map((e) => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' }))));
            }
            case 'GET /stat': {
              const s = await stat(full).catch(() => null);
              return send(200, JSON.stringify(s && s.isFile() ? { mtime: s.mtimeMs } : null));
            }
            case 'GET /read':
              return send(200, await readFile(full), 'application/octet-stream');
            case 'PUT /write':
            case 'DELETE /remove': {
              if (!WRITABLE.some((w) => path.startsWith(w))) return send(403, JSON.stringify({ error: `只能寫入 ${WRITABLE.join('、')}` }));
              if (req.method === 'DELETE') {
                await rm(full, { force: true });
                return send(200, '{}');
              }
              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              await mkdir(dirname(full), { recursive: true });
              await writeFile(full, Buffer.concat(chunks));
              return send(200, '{}');
            }
            default:
              return send(404, JSON.stringify({ error: 'unknown' }));
          }
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          send(code === 'ENOENT' ? 404 : 500, JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}
