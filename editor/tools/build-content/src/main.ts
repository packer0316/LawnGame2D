/**
 * 產出正式 content/（沒有 Aseprite／LDtk 的環境用）：
 *   測試美術（預設 game/dev-content，遊戲端 placeholder-art 的輸出）＋ LDtk 地圖 → 驗證 → content/
 *
 * 用法（在 editor/ 執行）：
 *   npx tsx tools/build-content/src/main.ts [--project <根目錄>] [--art-from game/dev-content]
 *       [--ldtk editor/fixtures/ldtk-verdant/world.ldtk] [--only avatar] [--regen-rooms] [--dry-run]
 *
 * - 不會動 content/class/（遊戲端手寫）。
 * - 測試美術中的 maps／rooms／manifest 不複製：地圖由 LDtk 轉換、房間表由地圖產生、manifest 重建。
 * - --only avatar：只更新 content/avatar/（遊戲端改了角色或武器的測試美術時用）。
 * - 先在記憶體中轉換並驗證，有錯誤就不寫入。
 */
import { validateBase, validateItem } from '../../../src/avatar/validate';
import { AvatarItemFile, BetLevelFileVersioned, MonsterDefFile, MonsterMathFileVersioned, RoomFileVersioned, ThemeFileVersioned, buildNavGraph, contentPaths, parseAsepriteSheet } from '@lawn/shared';
import type { MapDef, RoomFile } from '@lawn/shared';
import { buildManifest } from '../../../src/content/manifest';
import { dirname, joinPath, readJson, writeJson } from '../../../src/fs/projectFs';
import type { ProjectFs } from '../../../src/fs/projectFs';
import { convertLdtkProject, loadExternalLevels } from '../../../src/ldtk/convert';
import type { LdtkProject } from '../../../src/ldtk/types';
import { applyNavEdits, navEditsPath } from '../../../src/map/navEdits';
import type { NavEdits } from '../../../src/map/navEdits';
import { validateMaps } from '../../../src/map/validate';
import { validateMonster } from '../../../src/monster/validate';
import { ROOM_COUNT, defaultRoom, roomMapId, validateRooms } from '../../../src/rooms/rooms';
import { argValue, findProjectRoot, hasFlag, nodeFs } from '../../common/nodeFs';

/** 測試美術中要複製到 content/ 的資料夾（其餘由本工具產生或屬於遊戲端）。 */
const ART_DIRS = ['avatar', 'monsters', 'fx', 'tilesets', 'backgrounds', 'themes', 'math', 'ui'];

const THEME_NAMES: Record<string, string> = { theme_0001: '晨光森林', theme_0002: '螢苔洞窟', theme_0003: '月影遺跡' };

async function listFiles(fs: ProjectFs, dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.list(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.kind === 'directory') out.push(...(await listFiles(fs, p)));
    else out.push(p);
  }
  return out;
}

interface Issue {
  severity: 'error' | 'warning';
  message: string;
}

async function main() {
  const root = argValue('project') ?? (await findProjectRoot());
  const fs = nodeFs(root);
  const artFrom = argValue('art-from') ?? 'game/dev-content';
  const ldtkPath = argValue('ldtk') ?? 'editor/fixtures/ldtk-verdant/world.ldtk';
  const only = argValue('only');
  const dryRun = hasFlag('dry-run');
  const issues: Issue[] = [];
  const log = (s: string) => console.log(s);

  if (!(await fs.exists(`${artFrom}/manifest.json`)) && (await fs.list(artFrom)).length === 0) {
    throw new Error(`找不到測試美術 ${artFrom}（請先在 game/ 執行 npm run art）`);
  }

  // ── 1. 要複製的美術檔 ──
  const dirs = only === 'avatar' ? ['avatar'] : ART_DIRS;
  const copies: string[] = [];
  for (const d of dirs) copies.push(...(await listFiles(fs, `${artFrom}/${d}`)).map((p) => p.slice(artFrom.length + 1)));
  log(`測試美術：${artFrom}，${copies.length} 個檔案（${dirs.join('、')}）`);

  // ── 2. 地圖與房間（--only avatar 時略過） ──
  let maps: MapDef[] = [];
  let rooms: RoomFile | null = null;
  if (only !== 'avatar') {
    if (!(await fs.exists(ldtkPath))) throw new Error(`找不到 ${ldtkPath}（可用 npm run fixtures -- --profile verdant 產生）`);
    const ldtkDir = dirname(ldtkPath);
    const project = await loadExternalLevels(await readJson<LdtkProject>(fs, ldtkPath), (rel) => readJson(fs, joinPath(ldtkDir, rel)));
    const result = convertLdtkProject(project, { buildNav: buildNavGraph });
    for (const i of result.issues) issues.push({ severity: i.severity, message: `LDtk ${i.level}：${i.message}` });
    for (const map of result.maps) {
      const edits = await readJson<NavEdits>(fs, `content/${navEditsPath(map.id)}`).catch(() => undefined);
      if (edits) map.nav = applyNavEdits(map, map.nav, edits).nav;
    }
    maps = result.maps;
    issues.push(...validateMaps(maps).map((i) => ({ severity: i.severity, message: i.message })));

    // 主題要存在
    const themes = ThemeFileVersioned.migrate(await readJson(fs, `${artFrom}/${contentPaths.themes}`));
    const themeIds = new Set(themes.themes.map((t) => t.id));
    for (const m of maps) if (!themeIds.has(m.theme)) issues.push({ severity: 'error', message: `${m.id}：主題 ${m.theme} 不在 themes.json` });

    // 怪物等級（Boss 不放進一般生怪區與怪潮）
    const math = MonsterMathFileVersioned.migrate(await readJson(fs, `${artFrom}/${contentPaths.monstersMath}`));
    const tiers = new Map(math.monsters.map((m) => [m.id, m.tier] as const));

    // 房間表：已有就保留（補上缺的房），--regen-rooms 則全部重新產生
    const bets = await readJson(fs, `content/${contentPaths.betLevels}`)
      .then((raw) => BetLevelFileVersioned.migrate(raw).levels.map((l) => l.bet).sort((a, b) => a - b))
      .catch(() => undefined);
    const existing = hasFlag('regen-rooms')
      ? undefined
      : await readJson(fs, `content/${contentPaths.rooms}`).then((raw) => RoomFileVersioned.migrate(raw)).catch(() => undefined);
    const byId = new Map(existing?.rooms.map((r) => [r.id, r]) ?? []);
    const mapById = new Map(maps.map((m) => [m.id, m]));
    for (let id = 1; id <= ROOM_COUNT; id++) {
      if (byId.has(id)) continue;
      const map = mapById.get(roomMapId(id));
      if (!map) continue;
      const room = defaultRoom(id, map, { bets, tiers });
      const n = maps.filter((m) => m.theme === map.theme && Number(m.id.slice(4)) <= id).length;
      room.name = `${THEME_NAMES[map.theme] ?? map.name} ${n}`;
      byId.set(id, room);
    }
    rooms = { schemaVersion: 1, rooms: [...byId.values()].sort((a, b) => a.id - b.id) };
    const monsterIds = new Set((await fs.list(`${artFrom}/monsters`)).map((e) => /^(mob_\d{4})\.json$/.exec(e.name)?.[1]).filter((x): x is string => !!x));
    issues.push(...validateRooms(rooms, { maps: mapById, monsters: monsterIds, bets, tiers }).map((i) => ({ severity: i.severity, message: i.message })));

    // 怪物（sheet 與數值）
    for (const id of monsterIds) {
      const def = MonsterDefFile.migrate(await readJson(fs, `${artFrom}/${contentPaths.monster(id)}`));
      const sheet = await readJson(fs, `${artFrom}/${def.sheet}`).then((raw) => parseAsepriteSheet(raw)).catch(() => null);
      issues.push(...validateMonster(def, sheet, math).map((i) => ({ severity: i.severity, message: i.message })));
    }
  }

  // 角色與武器（STUDIO_SPEC §4）
  const baseSheet = await readJson(fs, `${artFrom}/${contentPaths.avatarBaseSheet}`).then((raw) => parseAsepriteSheet(raw)).catch(() => null);
  issues.push(...validateBase(baseSheet).map((i) => ({ severity: i.severity, message: i.message })));
  for (const e of await fs.list(`${artFrom}/avatar/items`)) {
    const id = /^([a-zA-Z]+_\d{4})\.json$/.exec(e.name)?.[1];
    if (!id) continue;
    const item = AvatarItemFile.migrate(await readJson(fs, `${artFrom}/${contentPaths.avatarItem(id)}`));
    const sheet = await readJson(fs, `${artFrom}/${item.sheet}`).then((raw) => parseAsepriteSheet(raw)).catch(() => null);
    issues.push(...validateItem(item, sheet, baseSheet).map((i) => ({ severity: i.severity, message: i.message })));
  }

  // ── 3. 報告 ──
  const errors = issues.filter((i) => i.severity === 'error');
  for (const i of issues) log(`${i.severity === 'error' ? '✖ 錯誤' : '⚠ 警告'}  ${i.message}`);
  log(`\n驗證：${errors.length} 個錯誤、${issues.length - errors.length} 個警告`);
  if (errors.length > 0 && !hasFlag('force')) {
    log('有錯誤，沒有寫入 content/（加 --force 可強制寫入）');
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    log('--dry-run：沒有寫入');
    return;
  }

  // ── 4. 寫入 ──
  if (only === 'avatar') {
    // 角色／武器可能有刪除：先清掉舊的
    for (const p of await listFiles(fs, 'content/avatar')) await fs.remove(p);
  }
  for (const rel of copies) await fs.writeFile(`content/${rel}`, await fs.readFile(`${artFrom}/${rel}`));
  if (only !== 'avatar') {
    for (const map of maps) await writeJson(fs, `content/${contentPaths.map(map.id)}`, map);
    if (rooms) await writeJson(fs, `content/${contentPaths.rooms}`, rooms);
  }
  await writeJson(fs, `content/${contentPaths.manifest}`, await buildManifest(fs));
  log(`已寫入 content/：美術 ${copies.length} 個檔案${only === 'avatar' ? '' : `、地圖 ${maps.length} 張、房間 ${rooms?.rooms.length ?? 0} 間`}，並重建 manifest.json`);

  if (rooms) {
    log('\n房間一覽：');
    const mapById = new Map(maps.map((m) => [m.id, m]));
    for (const r of rooms.rooms) {
      const m = mapById.get(r.mapId);
      log(`  ${String(r.id).padStart(2)}  ${r.name.padEnd(8)}  ${r.mapId}  ${m?.theme ?? '?'}  押注 ${r.betRange[0]}–${r.betRange[1]}${r.boss ? `  Boss ${r.boss.mobId}` : ''}${r.wave ? '  怪潮' : ''}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
