import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentManifest } from '@lawn/shared';
import { writeAvatar } from './avatar';
import { writeFx } from './fx';
import { writeMonsters } from './monsters';
import { writeJson } from './sheet';
import { writeWorld } from './world';

/**
 * 產生 Aseprite 匯出格式的測試內容（STUDIO_SPEC §8、§8.1）。
 * 用法：npm run gen -w @lawn/placeholder-art -- [--out <資料夾>] [--clean]
 * 預設輸出到 game/dev-content/。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1]! : path.join(here, '../../../dev-content'));

if (args.includes('--clean') && fs.existsSync(out)) fs.rmSync(out, { recursive: true });
fs.mkdirSync(out, { recursive: true });

const started = Date.now();
const { itemIds } = writeAvatar(out);
const { monsterIds } = writeMonsters(out);
const { fxIds } = writeFx(out);
const { mapIds } = writeWorld(out);

// content/class/ 由遊戲手寫（COLLAB §1），測試內容直接複製一份。
const classDir = path.join(here, '../../../../content/class');
fs.mkdirSync(path.join(out, 'class'), { recursive: true });
for (const file of fs.readdirSync(classDir)) fs.copyFileSync(path.join(classDir, file), path.join(out, 'class', file));

const manifest: ContentManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  avatarItems: itemIds,
  monsters: monsterIds,
  maps: mapIds,
  fx: fxIds,
};
writeJson(path.join(out, 'manifest.json'), manifest);

console.log(`測試內容已輸出到 ${out}（${Date.now() - started}ms）`);
console.log(`部件 ${itemIds.length}、怪物 ${monsterIds.length}、特效 ${fxIds.length}、地圖 ${mapIds.length}`);
