import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

/** 開發時把資料夾掛在某個網址下（content/ 在遊戲資料夾外，不能用 publicDir）。 */
function serveDir(urlPrefix: string, dir: string): Plugin {
  return {
    name: `serve-dir:${urlPrefix}`,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const relative = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = path.join(dir, relative);
        if (!file.startsWith(dir)) return next();
        fs.stat(file, (error, stat) => {
          if (error || !stat.isFile()) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Accept-Ranges', 'bytes');
          // 背景音樂串流、循環播放會分段讀（Range）
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
          if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
            if (start > end || start >= stat.size) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${stat.size}`);
              res.end();
              return;
            }
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', String(end - start + 1));
            fs.createReadStream(file, { start, end }).pipe(res);
            return;
          }
          res.setHeader('Content-Length', String(stat.size));
          fs.createReadStream(file).pipe(res);
        });
      });
    },
  };
}

/** 正式打包也帶上已生成的素材，預覽不依賴開發伺服器的目錄掛載。 */
function bundleContent(): Plugin {
  let outDir = '';
  return {
    name: 'bundle-game-content',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    writeBundle() {
      for (const [name, dir] of [
        ['dev-content', path.join(repoRoot, 'game/dev-content')],
        ['content', path.join(repoRoot, 'content')],
      ]) {
        if (fs.existsSync(path.join(dir!, 'manifest.json'))) fs.cpSync(dir!, path.join(outDir, name!), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    bundleContent(),
    serveDir('/content', path.join(repoRoot, 'content')),
    serveDir('/dev-content', path.join(repoRoot, 'game', 'dev-content')),
  ],
  server: { port: 5173 },
});
