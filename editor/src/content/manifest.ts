import { ContentManifestFile, isValidId } from '@lawn/shared';
import type { ContentManifest } from '@lawn/shared';
import type { ProjectFs } from '../fs/projectFs';

const SETTINGS_FILE = /^(.+)\.json$/;
const SHEET_FILE = /^(.+)\.sheet\.json$/;

/** 列出資料夾中的設定檔 ID（`{id}.json`，排除 `.sheet.json`）。 */
async function settingIds(fs: ProjectFs, dir: string, category: string): Promise<string[]> {
  return (await fs.list(`content/${dir}`))
    .filter((e) => e.kind === 'file' && !SHEET_FILE.test(e.name))
    .map((e) => SETTINGS_FILE.exec(e.name)?.[1])
    .filter((id): id is string => id !== undefined && isValidId(id, category))
    .sort();
}

/** 掃描 content/，產生 manifest（STUDIO_SPEC §8.1）。 */
export async function buildManifest(fs: ProjectFs, now = new Date()): Promise<ContentManifest> {
  const fx = (await fs.list('content/fx'))
    .map((e) => SHEET_FILE.exec(e.name)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort();
  return {
    schemaVersion: ContentManifestFile.version as 1,
    generatedAt: now.toISOString(),
    avatarItems: (await fs.list('content/avatar/items'))
      .filter((e) => e.kind === 'file' && !SHEET_FILE.test(e.name))
      .map((e) => SETTINGS_FILE.exec(e.name)?.[1])
      .filter((id): id is string => id !== undefined && isValidId(id))
      .sort(),
    monsters: await settingIds(fs, 'monsters', 'mob'),
    maps: await settingIds(fs, 'maps', 'map'),
    fx,
  };
}
