import { z } from 'zod';
import { versioned } from '../versioned';
import { IdSchema } from './common';

/**
 * `content/manifest.json`：匯出時產生。HTTP 無法列目錄，遊戲先讀它取得各類 ID，
 * 再用 contentPaths 組出檔名（STUDIO_SPEC §8.1）。
 */
export const ContentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  /** ISO 時間 */
  generatedAt: z.string(),
  avatarItems: z.array(IdSchema),
  monsters: z.array(IdSchema),
  maps: z.array(IdSchema),
  fx: z.array(z.string().min(1)),
});
export type ContentManifest = z.infer<typeof ContentManifestSchema>;
export const ContentManifestFile = versioned(ContentManifestSchema, 1);

/** content/ 內的固定路徑（STUDIO_SPEC §8）。全部相對 content/ 根目錄。 */
export const contentPaths = {
  manifest: 'manifest.json',
  avatarBaseSheet: 'avatar/base.sheet.json',
  palettes: 'avatar/palettes.json',
  avatarItem: (id: string) => `avatar/items/${id}.json`,
  avatarItemSheet: (id: string) => `avatar/items/${id}.sheet.json`,
  monster: (id: string) => `monsters/${id}.json`,
  monsterSheet: (id: string) => `monsters/${id}.sheet.json`,
  fxSheet: (id: string) => `fx/${id}.sheet.json`,
  map: (id: string) => `maps/${id}.json`,
  themes: 'themes/themes.json',
  rooms: 'rooms/rooms.json',
  classes: 'class/classes.json',
  skills: 'class/skills.json',
  betLevels: 'class/bet-levels.json',
  monstersMath: 'math/monsters.math.json',
  /** 法線貼圖：同名加 `_n`。 */
  normalMap: (imagePath: string) => imagePath.replace(/\.png$/, '_n.png'),
} as const;
