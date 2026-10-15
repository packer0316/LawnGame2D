import {
  AvatarItemFile,
  BetLevelFileVersioned,
  ClassFileVersioned,
  ContentManifestFile,
  SkillFileVersioned,
  type BetLevel,
  type ClassDef,
  type ClassId,
  type SkillDef,
  MapDefFile,
  MonsterDefFile,
  MonsterMathFileVersioned,
  PaletteFileVersioned,
  RoomFileVersioned,
  ThemeFileVersioned,
  contentPaths,
  parseAsepriteSheet,
  resolveSheetImage,
  type AseSheet,
  type AvatarItem,
  type ContentManifest,
  type MapDef,
  type MonsterDef,
  type MonsterMath,
  type PaletteFile,
  type RoomDef,
  type ThemeDef,
} from '@lawn/shared';
import type { ContentSource } from '../content';

/** 一張 Aseprite sheet：解析後的資料 + 圖片在 content/ 的路徑。 */
export interface SheetAsset {
  /** .sheet.json 的路徑，同時當作 Phaser 的 texture key。 */
  path: string;
  sheet: AseSheet;
  image: string;
}

export interface ContentBundle {
  source: ContentSource;
  manifest: ContentManifest;
  palettes: PaletteFile;
  base: SheetAsset;
  items: Map<string, { item: AvatarItem; sheet: SheetAsset }>;
  monsters: Map<string, { def: MonsterDef; sheet: SheetAsset; math: MonsterMath | undefined }>;
  fx: Map<string, SheetAsset>;
  themes: Map<string, ThemeDef>;
  rooms: RoomDef[];
  classes: Map<ClassId, ClassDef>;
  skills: Map<string, SkillDef>;
  betLevels: BetLevel[];
  loadMap(id: string): Promise<MapDef>;
}

async function loadSheet(source: ContentSource, path: string): Promise<SheetAsset> {
  const sheet = parseAsepriteSheet(await source.json(path));
  return { path, sheet, image: resolveSheetImage(path, sheet.image) };
}

/** 讀取 manifest 與所有固定檔案（圖片之後由 Phaser 載入）。 */
export async function loadContentBundle(source: ContentSource): Promise<ContentBundle> {
  const manifest = ContentManifestFile.migrate(await source.json(contentPaths.manifest));
  const [palettes, base, themes, rooms, math, classes, skills, betLevels] = await Promise.all([
    source.json(contentPaths.palettes).then((raw) => PaletteFileVersioned.migrate(raw)),
    loadSheet(source, contentPaths.avatarBaseSheet),
    source.json(contentPaths.themes).then((raw) => ThemeFileVersioned.migrate(raw)),
    source.json(contentPaths.rooms).then((raw) => RoomFileVersioned.migrate(raw)),
    source
      .json(contentPaths.monstersMath)
      .then((raw) => MonsterMathFileVersioned.migrate(raw))
      .catch(() => null),
    source.json(contentPaths.classes).then((raw) => ClassFileVersioned.migrate(raw)),
    source.json(contentPaths.skills).then((raw) => SkillFileVersioned.migrate(raw)),
    source.json(contentPaths.betLevels).then((raw) => BetLevelFileVersioned.migrate(raw)),
  ]);

  const items = new Map<string, { item: AvatarItem; sheet: SheetAsset }>();
  await Promise.all(
    manifest.avatarItems.map(async (id) => {
      const item = AvatarItemFile.migrate(await source.json(contentPaths.avatarItem(id)));
      items.set(id, { item, sheet: await loadSheet(source, item.sheet) });
    }),
  );

  const mathById = new Map((math?.monsters ?? []).map((m) => [m.id, m]));
  const monsters = new Map<string, { def: MonsterDef; sheet: SheetAsset; math: MonsterMath | undefined }>();
  await Promise.all(
    manifest.monsters.map(async (id) => {
      const def = MonsterDefFile.migrate(await source.json(contentPaths.monster(id)));
      monsters.set(id, { def, sheet: await loadSheet(source, def.sheet), math: mathById.get(def.mathId) });
    }),
  );

  const fx = new Map<string, SheetAsset>();
  await Promise.all(manifest.fx.map(async (id) => fx.set(id, await loadSheet(source, contentPaths.fxSheet(id)))));

  const mapCache = new Map<string, Promise<MapDef>>();
  return {
    source,
    manifest,
    palettes,
    base,
    items,
    monsters,
    fx,
    themes: new Map(themes.themes.map((theme) => [theme.id, theme])),
    rooms: rooms.rooms,
    classes: new Map(classes.classes.map((c) => [c.id, c])),
    skills: new Map(skills.skills.map((s) => [s.id, s])),
    betLevels: betLevels.levels,
    loadMap(id) {
      let pending = mapCache.get(id);
      if (!pending) {
        pending = source.json(contentPaths.map(id)).then((raw) => MapDefFile.migrate(raw));
        mapCache.set(id, pending);
      }
      return pending;
    },
  };
}
