/**
 * 產生編輯器的測試資料：fixtures/ldtk/world.ldtk 與 tileset 圖。
 * 用法：npm run fixtures [-- --out <資料夾>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLdtkProject } from './ldtkBuilder';
import { encodePng } from './png';
import { generateRoom } from './rooms';
import { PALETTES, TILESET_COLS, TILESET_ROWS, paintTileset } from './tilesets';
import { GRID } from './ldtkBuilder';

const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf('--out');
const outDir = resolve(outArg >= 0 ? process.argv[outArg + 1]! : join(here, '../../../fixtures'));
const ldtkDir = join(outDir, 'ldtk');

mkdirSync(join(ldtkDir, 'tilesets'), { recursive: true });

const tilesets = Object.entries(PALETTES).map(([identifier, palette]) => {
  const relPath = `tilesets/${identifier}.png`;
  writeFileSync(join(ldtkDir, relPath), encodePng(paintTileset(palette)));
  return { identifier, relPath, pxWid: TILESET_COLS * GRID, pxHei: TILESET_ROWS * GRID };
});

const rooms = Array.from({ length: 20 }, (_, i) => generateRoom(i + 1));
const project = buildLdtkProject(rooms, tilesets);
writeFileSync(join(ldtkDir, 'world.ldtk'), JSON.stringify(project, null, '\t'));

console.log(`已產生 ${rooms.length} 個房間、${tilesets.length} 個 tileset → ${ldtkDir}`);
