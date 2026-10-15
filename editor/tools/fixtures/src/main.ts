/**
 * 產生編輯器的測試資料：world.ldtk 與 tileset 圖。
 *
 * 用法：
 *   npm run fixtures                          編輯器自己的測試 tileset → fixtures/ldtk/
 *   npm run fixtures -- --profile verdant     遊戲端「晨光魔法森林」tileset（game/dev-content/tilesets，唯讀複製）→ fixtures/ldtk-verdant/
 *   [--out <資料夾>] [--tilesets-from <資料夾>]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRID, PROGRAMMER_PROFILE, VERDANT_PROFILE, buildLdtkProject } from './ldtkBuilder';
import type { TilesetSpec } from './ldtkBuilder';
import { encodePng } from './png';
import { generateRoom } from './rooms';
import { PALETTES, TILESET_COLS, TILESET_ROWS, paintTileset } from './tilesets';
import landmarks from '../../../../game/assets/landmarks/catalog.json';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const profileName = arg('profile') ?? 'programmer';
const profile = profileName === 'verdant' ? VERDANT_PROFILE : PROGRAMMER_PROFILE;
const outDir = resolve(arg('out') ?? join(here, '../../../fixtures'));
const ldtkDir = join(outDir, profileName === 'verdant' ? 'ldtk-verdant' : 'ldtk');
mkdirSync(join(ldtkDir, 'tilesets'), { recursive: true });

/** PNG 的寬高（IHDR）。 */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

let tilesets: TilesetSpec[];
if (profileName === 'verdant') {
  const from = resolve(arg('tilesets-from') ?? join(here, '../../../../game/dev-content/tilesets'));
  tilesets = [...Object.keys(PALETTES), ...landmarks.scenes.map(s => s.id)].map((identifier) => {
    const src = join(from, `${identifier}.png`);
    if (!existsSync(src)) throw new Error(`找不到 ${src}（請先在 game/ 執行 npm run art 產生測試美術）`);
    const relPath = `tilesets/${identifier}.png`;
    copyFileSync(src, join(ldtkDir, relPath));
    const normal = join(from, `${identifier}_n.png`);
    if (existsSync(normal)) copyFileSync(normal, join(ldtkDir, `tilesets/${identifier}_n.png`));
    const { w, h } = pngSize(src);
    return { identifier, relPath, pxWid: w, pxHei: h };
  });
} else {
  tilesets = Object.entries(PALETTES).map(([identifier, palette]) => {
    const relPath = `tilesets/${identifier}.png`;
    writeFileSync(join(ldtkDir, relPath), encodePng(paintTileset(palette)));
    return { identifier, relPath, pxWid: TILESET_COLS * GRID, pxHei: TILESET_ROWS * GRID };
  });
}

const rooms = Array.from({ length: 20 }, (_, i) => generateRoom(i + 1, profileName === 'verdant'));
const project = buildLdtkProject(rooms, tilesets, profile);
writeFileSync(join(ldtkDir, 'world.ldtk'), JSON.stringify(project, null, '\t'));

console.log(`已產生 ${rooms.length} 個房間（tileset 規則：${profile.name}）、${tilesets.length} 個 tileset → ${ldtkDir}`);
