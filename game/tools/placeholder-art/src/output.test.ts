import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AVATAR_LAYERS,
  AVATAR_TAG_NAMES,
  AvatarItemFile,
  composeAvatarFrame,
  loadoutMapping,
  recolorPixels,
  BetLevelFileVersioned,
  ClassFileVersioned,
  SkillFileVersioned,
  ContentManifestFile,
  MapDefFile,
  MonsterDefFile,
  MonsterMathFileVersioned,
  PaletteFileVersioned,
  RoomFileVersioned,
  ThemeFileVersioned,
  contentPaths,
  parseAsepriteSheet,
  posesInTag,
  resolveSheetImage,
  viewFrames,
} from '@lawn/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lawn-placeholder-'));
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(out, p), 'utf8'));

beforeAll(() => {
  execFileSync(process.execPath, [path.join(here, '../../../node_modules/tsx/dist/cli.mjs'), path.join(here, 'main.ts'), '--out', out]);
}, 60_000);

describe('placeholder-art 輸出', () => {
  it('manifest 與固定檔案都符合 schema', () => {
    const manifest = ContentManifestFile.migrate(read(contentPaths.manifest));
    expect(manifest.avatarItems.length).toBeGreaterThan(10);
    PaletteFileVersioned.migrate(read(contentPaths.palettes));
    ThemeFileVersioned.migrate(read(contentPaths.themes));
    RoomFileVersioned.migrate(read(contentPaths.rooms));
    MonsterMathFileVersioned.migrate(read(contentPaths.monstersMath));
  });

  it('身體 sheet：15 個 Tag、三個錨點、分層命名', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    expect([...base.tags.keys()]).toEqual(AVATAR_TAG_NAMES);
    expect(base.frameCount).toBe(67);
    expect(base.layers).toEqual(['arm_front', 'body', 'head']);
    for (const slice of ['head', 'torso', 'hand']) expect(base.sliceAt(slice, 66)).toBeDefined();
    const views = viewFrames(base);
    expect(base.frame('head', views.front)).toBeDefined();
    expect(base.frame('head', views.back)).toBeDefined();
    expect(fs.existsSync(path.join(out, resolveSheetImage(contentPaths.avatarBaseSheet, base.image)))).toBe(true);
  });

  it('部件：設定檔符合 schema，姿勢部件每個動作都有姿勢', () => {
    const manifest = read(contentPaths.manifest);
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    for (const id of manifest.avatarItems as string[]) {
      const item = AvatarItemFile.migrate(read(contentPaths.avatarItem(id)));
      const sheet = parseAsepriteSheet(read(item.sheet));
      if (item.kind !== 'pose' || item.category === 'weapon') continue;
      for (const tag of base.tags.values()) {
        expect(posesInTag(sheet, item.layers[0]!, tag).length, `${id} ${tag.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('職業、技能、押注等級：引用都存在', () => {
    const classes = ClassFileVersioned.migrate(read(contentPaths.classes));
    const skills = SkillFileVersioned.migrate(read(contentPaths.skills));
    BetLevelFileVersioned.migrate(read(contentPaths.betLevels));
    const skillIds = new Set(skills.skills.map((s) => s.id));
    const manifest = read(contentPaths.manifest);
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    expect(classes.classes.map((c) => c.id)).toEqual(['warrior', 'mage', 'archer', 'assassin']);
    for (const c of classes.classes) {
      for (const id of [c.basic, ...c.skills]) expect(skillIds.has(id), id).toBe(true);
      expect(manifest.avatarItems).toContain(c.weapon);
    }
    for (const skill of skills.skills) {
      expect(base.tags.has(skill.pose), skill.pose).toBe(true);
      if (skill.comboNext) expect(skillIds.has(skill.comboNext)).toBe(true);
    }
  });

  it('紙娃娃擺放：戴帽髮型、背面沒有臉、表情、姿勢對齊錨點', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    const part = (id: string) => {
      const item = AvatarItemFile.migrate(read(contentPaths.avatarItem(id)));
      return { item, sheet: parseAsepriteSheet(read(item.sheet)) };
    };
    const parts = ['face_0001', 'hair_0001', 'hat_0001', 'top_0001'].map(part);
    const stand = base.tags.get('stand')!;
    const ladder = base.tags.get('ladder')!;
    const run = base.tags.get('run')!;

    const front = composeAvatarFrame(base, parts, stand.from);
    const layerOf = (ops: ReturnType<typeof composeAvatarFrame>, layer: string) => ops.find((op) => op.layer === layer);
    expect(layerOf(front, 'hair_front')?.frameLayer).toBe('hair_front@underHat');
    expect(layerOf(front, 'hat')).toBeDefined();
    expect(layerOf(front, 'face')?.frameLayer).toBe('face');
    expect(front.map((op) => op.layer)).toEqual(AVATAR_LAYERS.filter((l) => front.some((op) => op.layer === l)));

    expect(layerOf(composeAvatarFrame(base, parts, stand.from, { expression: 'blink' }), 'face')?.frameLayer).toBe('face@blink');

    const back = composeAvatarFrame(base, parts, ladder.from + 1);
    expect(layerOf(back, 'face')).toBeUndefined();
    expect(layerOf(back, 'head')?.frameIndex).toBe(ladder.from);

    // run 第 1 幀用第 0 個姿勢，偏移 = torso 錨點的位移
    const ops = composeAvatarFrame(base, parts, run.from + 1);
    const top = layerOf(ops, 'top')!;
    expect(top.frameIndex).toBe(run.from);
    const now = base.slicePivotAt('torso', run.from + 1)!;
    const then = base.slicePivotAt('torso', run.from)!;
    expect([top.dx, top.dy]).toEqual([now.x - then.x, now.y - then.y]);

    // 沒戴帽：用完整髮型
    const bare = composeAvatarFrame(base, ['face_0001', 'hair_0001'].map(part), stand.from);
    expect(layerOf(bare, 'hair_front')?.frameLayer).toBe('hair_front');
  });

  it('換色：Key 色階換成選定的顏色', () => {
    const palettes = PaletteFileVersioned.migrate(read(contentPaths.palettes));
    const mapping = loadoutMapping(palettes, { items: [], skin: 'palette_0002', hair: 'palette_0011', eye: 'palette_0020' }, null)!;
    const key = palettes.keyRamps.skin[1]!;
    const target = palettes.palettes.find((p) => p.id === 'palette_0002')!.colors[1]!;
    const pixel = new Uint8ClampedArray([Number.parseInt(key.slice(1, 3), 16), Number.parseInt(key.slice(3, 5), 16), Number.parseInt(key.slice(5, 7), 16), 255]);
    recolorPixels(pixel, mapping);
    expect([...pixel.slice(0, 3)]).toEqual([1, 3, 5].map((i) => Number.parseInt(target.slice(i, i + 2), 16)));
  });

  it('森境旅人整體造型涵蓋所有動作，卸下後恢復紙娃娃', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    const part = (id: string) => {
      const item = AvatarItemFile.migrate(read(contentPaths.avatarItem(id)));
      return { item, sheet: parseAsepriteSheet(read(item.sheet)) };
    };
    const outfit = part('overall_0001');
    const weapon = part('weapon_0001');
    for (const tag of base.tags.values()) for (let f = tag.from; f <= tag.to; f++) {
      const ops = composeAvatarFrame(base, [outfit, weapon], f);
      const body = ops.find((op) => op.source === 'overall_0001');
      expect(body?.frameIndex, `${tag.name}:${f}`).toBe(f);
      expect(ops.some((op) => op.source === 'base')).toBe(false);
      expect(outfit.sheet.frame('top', f)?.sourceRect.h).toBeGreaterThan(20);
    }
    expect(composeAvatarFrame(base, [outfit, weapon], 0).some((op) => op.layer === 'weapon')).toBe(true);
    expect(composeAvatarFrame(base, [weapon], 0).some((op) => op.source === 'base')).toBe(true);
  });

  it('所有主題的背景與法線貼圖都隨內容輸出', () => {
    const themes = ThemeFileVersioned.migrate(read(contentPaths.themes));
    for (const theme of themes.themes) {
      const images = [theme.tileset.image, theme.tileset.normal, ...theme.backgrounds.map((bg) => bg.image)].filter((p): p is string => Boolean(p));
      for (const image of images) expect(fs.existsSync(path.join(out, image)), image).toBe(true);
    }
  });

  it('怪物與地圖符合 schema', () => {
    const manifest = read(contentPaths.manifest);
    for (const id of manifest.monsters as string[]) {
      const monster = MonsterDefFile.migrate(read(contentPaths.monster(id)));
      const sheet = parseAsepriteSheet(read(monster.sheet));
      for (const tag of [monster.tags.move, monster.tags.idle, monster.tags.hit, monster.tags.die]) expect(sheet.tags.has(tag)).toBe(true);
    }
    for (const id of manifest.maps as string[]) {
      const map = MapDefFile.migrate(read(contentPaths.map(id)));
      expect(map.footholds.length).toBeGreaterThan(0);
      expect(map.walls.length).toBeGreaterThan(0);
      expect(map.ceilings.length).toBeGreaterThan(0);
      expect(map.climbables.length).toBeGreaterThan(0);
      for (const zone of map.spawnZones) expect(zone.footholdIds.length, `${id} ${zone.id}`).toBeGreaterThan(0);
    }
  });
});
