/**
 * LDtk → content/maps/*.json（STUDIO_SPEC §6.4）。編輯器地圖頁的 CLI 版本，轉換邏輯共用 src/ldtk/。
 *
 * 用法（在 editor/ 執行）：
 *   npm run ldtk-convert [-- --in art/maps/world.ldtk] [--project <專案根目錄>] [--check]
 *   --check：只轉換與驗證，不寫檔（CI 用）
 * 有錯誤時結束碼為 1。
 */
import { buildNavGraph, contentPaths } from '@lawn/shared';
import { buildManifest } from '../../../src/content/manifest';
import { dirname, joinPath, readJson, writeJson } from '../../../src/fs/projectFs';
import { convertLdtkProject, loadExternalLevels } from '../../../src/ldtk/convert';
import type { LdtkProject } from '../../../src/ldtk/types';
import { applyNavEdits, navEditsPath } from '../../../src/map/navEdits';
import type { NavEdits } from '../../../src/map/navEdits';
import { validateMaps } from '../../../src/map/validate';
import { argValue, findProjectRoot, hasFlag, nodeFs } from '../../common/nodeFs';

async function main() {
  const root = argValue('project') ?? (await findProjectRoot());
  const fs = nodeFs(root);
  const input = argValue('in') ?? 'art/maps/world.ldtk';
  const check = hasFlag('check');
  if (!(await fs.exists(input))) throw new Error(`找不到 ${input}（專案：${root}）`);

  const ldtkDir = dirname(input);
  const project = await loadExternalLevels(await readJson<LdtkProject>(fs, input), (rel) => readJson(fs, joinPath(ldtkDir, rel)));
  const result = convertLdtkProject(project, { buildNav: buildNavGraph });
  const issues = result.issues.map((i) => ({ severity: i.severity, message: `LDtk ${i.level}：${i.message}` }));
  // 套用編輯器的手動導航修改（content/maps/{id}.navedits.json）
  for (const map of result.maps) {
    const edits = await readJson<NavEdits>(fs, `content/${navEditsPath(map.id)}`).catch(() => undefined);
    if (!edits) continue;
    const applied = applyNavEdits(map, map.nav, edits);
    map.nav = applied.nav;
    for (const u of applied.unresolved) issues.push({ severity: 'warning', message: `${map.id}：手動${u.kind === 'add' ? '新增' : '刪除'}的導航連線找不到對應的足場` });
  }
  issues.push(...validateMaps(result.maps));
  for (const i of issues) console.log(`${i.severity === 'error' ? '✖ 錯誤' : '⚠ 警告'}  ${i.message}`);
  const errors = issues.filter((i) => i.severity === 'error').length;
  console.log(`\n${result.maps.length} 張地圖，${errors} 個錯誤，${issues.length - errors} 個警告`);
  if (errors > 0) {
    process.exitCode = 1;
    return;
  }
  if (check) return;

  for (const map of result.maps) await writeJson(fs, `content/${contentPaths.map(map.id)}`, map);
  let copied = 0;
  for (const t of project.defs.tilesets) {
    if (!t.relPath?.endsWith('.png')) continue;
    const source = joinPath(ldtkDir, t.relPath);
    const target = `content/tilesets/${t.identifier}.png`;
    await fs.writeFile(target, await fs.readFile(source));
    copied++;
    const normal = source.replace(/\.png$/, '_n.png');
    if (await fs.exists(normal)) await fs.writeFile(contentPaths.normalMap(target), await fs.readFile(normal));
  }
  await writeJson(fs, `content/${contentPaths.manifest}`, await buildManifest(fs));
  console.log(`已寫入 content/maps/（${result.maps.length} 個）、content/tilesets/（${copied} 個），並更新 manifest.json`);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
