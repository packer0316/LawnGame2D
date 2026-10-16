// 版本更新部署（updateRelease.bat 呼叫）：比對建置結果與上次部署的清單，只上傳有變動的檔案。
//
//   node scripts/release-prepare.mjs           產生 web/release/：Artifact 頁面檔、給 Claude 的部署指示（prompt.txt）、待確認的新清單
//   node scripts/release-prepare.mjs --commit  部署成功後，把新清單存成 web/release-manifest.json（下次比對用）
//
// 結束碼：0 = 有東西要部署、2 = 沒有變動、1 = 錯誤。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACT_URL = 'https://claude.ai/artifact/NTjSKzmHiqXQzyPyk1cU5j';
/** Artifact 一次發布最多 255 個檔、64 MB：留一點餘裕 */
const BATCH_FILES = 200;
const BATCH_BYTES = 55 * 1024 * 1024;

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const dist = path.join(web, 'dist');
const out = path.join(web, 'release');
const manifestPath = path.join(web, 'release-manifest.json');
const pendingPath = path.join(out, 'manifest.pending.json');

if (process.argv.includes('--commit')) {
  if (!fs.existsSync(pendingPath)) fail('找不到 web/release/manifest.pending.json，請先執行準備步驟。');
  fs.copyFileSync(pendingPath, manifestPath);
  console.log(`已記錄這次部署的檔案清單：${path.relative(process.cwd(), manifestPath)}`);
  process.exit(0);
}

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('找不到 web/dist/index.html，請先建置（npm run build）。');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Artifact 頁面：發布時會自動包上 doctype／html／head／body，這裡只放 title、背景、CSS 與主程式
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const script = /<script type="module"[^>]*src="([^"]+)"/.exec(index)?.[1];
const style = /<link rel="stylesheet"[^>]*href="([^"]+)"/.exec(index)?.[1];
if (!script || !style) fail('index.html 裡找不到主程式或 CSS。');
const pagePath = path.join(out, 'LawnGame2D.html');
fs.writeFileSync(pagePath, `<title>LawnGame2D</title>
<style>
  /* 遊戲固定一套深色畫面，不跟淺色主題切換 */
  :root { color-scheme: dark; --bg: #0d0c12; }
  html, body, #root { background: var(--bg); width: 100%; height: 100%; margin: 0; overflow: hidden; }
</style>
<link rel="stylesheet" href="${style}">
<div id="root"></div>
<script type="module" src="${script}"></script>
`);

// 建置結果（index.html 以外）的雜湊
const files = {};
const sizes = {};
for (const file of walk(dist)) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  if (rel === 'index.html') continue;
  const data = fs.readFileSync(file);
  files[rel] = crypto.createHash('sha1').update(data).digest('hex');
  sizes[rel] = data.length;
}
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files ?? {} : {};
const changed = Object.keys(files).filter((p) => previous[p] !== files[p]).sort();
const removed = Object.keys(previous).filter((p) => !(p in files)).sort();
fs.writeFileSync(pendingPath, JSON.stringify({ url: ARTIFACT_URL, page: { script, style }, files }, null, 1));

const mb = (bytes) => (bytes / 1048576).toFixed(1);
const total = changed.reduce((sum, p) => sum + sizes[p], 0);
console.log(`建置結果 ${Object.keys(files).length} 個檔；這次要上傳 ${changed.length} 個（${mb(total)} MB）、移除 ${removed.length} 個舊檔。`);
if (changed.length === 0 && removed.length === 0) {
  console.log('跟上次部署相同，不需要更新。');
  process.exit(2);
}

// 分批：每批不超過 BATCH_FILES 個檔、BATCH_BYTES；舊檔最後一批才移除（新檔都上去了才拿掉舊的）
const batches = [];
let current = {};
let count = 0;
let bytes = 0;
for (const p of changed) {
  if (count > 0 && (count + 1 > BATCH_FILES || bytes + sizes[p] > BATCH_BYTES)) {
    batches.push(current);
    current = {};
    count = 0;
    bytes = 0;
  }
  current[p] = p;
  count += 1;
  bytes += sizes[p];
}
for (const p of removed) {
  if (count + 1 > BATCH_FILES) {
    batches.push(current);
    current = {};
    count = 0;
  }
  current[p] = null;
  count += 1;
}
batches.push(current);

const steps = batches.map((files, i) => `### 第 ${i + 1} 批（共 ${batches.length} 批）
Artifact 工具呼叫：action "publish"、url "${ARTIFACT_URL}"、file_path "${pagePath}"、root "${dist}"、label "版本更新 ${i + 1}/${batches.length}"，files 參數完全照下面這個 JSON（值是 null 的代表從 Artifact 移除）：
${JSON.stringify(files)}
`).join('\n');

const prompt = `你是 LawnGame2D 的部署工具，任務是把新版遊戲更新到已存在的 claude.ai Artifact。這是更新既有的 Artifact，不要執行 quickstart、不要載入任何 skill、不要建立新的 Artifact、不要修改或新增任何本機檔案，也不要做其他事。

1. 先用 Artifact 工具 action "read"、url "${ARTIFACT_URL}" 讀一次這個 Artifact（規定：更新前要先讀），
   再用 action "list"、scope "files"、url "${ARTIFACT_URL}" 列出目前的檔案（規定：要取代或移除既有的檔案，這個工作階段必須先列過）。
2. 依序執行下面每一批發布，每一批都要帶同一個 file_path（頁面檔）與 root。不要傳 icon。發布被拒絕時照錯誤訊息處理（例如先重新列出檔案）再重試一次，還是失敗就停下。
${steps}
3. 全部發布完後，用 Artifact 工具 action "list"、scope "files"、url "${ARTIFACT_URL}" 列出檔案，確認：
   - 第 2 步每一批 files 裡值不是 null 的路徑都在清單裡；
   - 值是 null 的路徑都不在清單裡；
   - 有 index.html。
4. 最後一行只輸出 RELEASE_OK（全部成功）或 RELEASE_FAIL: <原因>（任何一步失敗就停下並回報）。
`;
fs.writeFileSync(path.join(out, 'prompt.txt'), prompt);
console.log(`分 ${batches.length} 批發布到 ${ARTIFACT_URL}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function fail(message) {
  console.error(`[錯誤] ${message}`);
  process.exit(1);
}
