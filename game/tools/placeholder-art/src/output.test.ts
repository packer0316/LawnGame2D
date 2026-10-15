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
  BetLevelFileVersioned,
  ClassFileVersioned,
  SkillFileVersioned,
  ContentManifestFile,
  MapDefFile,
  MonsterDefFile,
  MonsterMathFileVersioned,
  RoomFileVersioned,
  ThemeFileVersioned,
  contentPaths,
  parseAsepriteSheet,
  reachableFrom,
  posesInTag,
  resolveSheetImage,
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
    // 人物固定、只換武器（SPEC v0.6 §4.3）：部件只有四把武器，不輸出調色盤
    expect(manifest.avatarItems).toEqual(['weapon_0001', 'weapon_0002', 'weapon_0003', 'weapon_0004']);
    expect(fs.existsSync(path.join(out, 'avatar/palettes.json'))).toBe(false);
    ThemeFileVersioned.migrate(read(contentPaths.themes));
    RoomFileVersioned.migrate(read(contentPaths.rooms));
    MonsterMathFileVersioned.migrate(read(contentPaths.monstersMath));
  });

  it('人物 sheet：15 個 Tag、67 幀都有人物、三個錨點', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    expect([...base.tags.keys()]).toEqual(AVATAR_TAG_NAMES);
    expect(base.frameCount).toBe(67);
    expect(base.layers).toEqual(['body']);
    for (let f = 0; f < 67; f += 1) expect(base.frame('body', f), `frame ${f}`).toBeDefined();
    for (const slice of ['head', 'torso', 'hand']) expect(base.sliceAt(slice, 66)).toBeDefined();
    expect(fs.existsSync(path.join(out, resolveSheetImage(contentPaths.avatarBaseSheet, base.image)))).toBe(true);
  });

  it('武器：每職業一把，通用動作與該職業的攻擊都有姿勢，爬繩梯時收起', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    const manifest = read(contentPaths.manifest);
    const attackTags: Record<string, string[]> = { warrior: ['swing1', 'swing2', 'swing3'], mage: ['cast'], archer: ['shoot'], assassin: ['throw'] };
    for (const id of manifest.avatarItems as string[]) {
      const item = AvatarItemFile.migrate(read(contentPaths.avatarItem(id)));
      expect(item.category).toBe('weapon');
      expect(item.classId).toBeDefined();
      const sheet = parseAsepriteSheet(read(item.sheet));
      for (const tag of ['stand', 'run', 'jump', ...attackTags[item.classId!]!]) {
        expect(posesInTag(sheet, 'weapon', base.tags.get(tag)!).length, `${id} ${tag}`).toBeGreaterThan(0);
      }
      for (const tag of ['ladder', 'rope']) expect(posesInTag(sheet, 'weapon', base.tags.get(tag)!)).toEqual([]);
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

  it('角色組裝：人物每幀都畫，武器夾在人物前方、跟著 hand 錨點，爬繩梯時不畫', () => {
    const base = parseAsepriteSheet(read(contentPaths.avatarBaseSheet));
    const part = (id: string) => {
      const item = AvatarItemFile.migrate(read(contentPaths.avatarItem(id)));
      return { item, sheet: parseAsepriteSheet(read(item.sheet)) };
    };
    const layerOf = (ops: ReturnType<typeof composeAvatarFrame>, layer: string) => ops.find((op) => op.layer === layer);
    const sword = part('weapon_0001');
    const run = base.tags.get('run')!;
    const ladder = base.tags.get('ladder')!;

    for (let f = 0; f < 67; f += 1) expect(layerOf(composeAvatarFrame(base, [sword], f), 'body')?.frameIndex, `frame ${f}`).toBe(f);

    // 原畫主角的武器每幀都有畫：直接用同一幀、不需要錨點位移；圖層順序 body 在 weapon 之前
    const ops = composeAvatarFrame(base, [sword], run.from + 1);
    expect(ops.map((op) => op.layer)).toEqual(AVATAR_LAYERS.filter((l) => ops.some((op) => op.layer === l)));
    const weapon = layerOf(ops, 'weapon')!;
    expect(weapon.frameIndex).toBe(run.from + 1);
    expect([weapon.dx, weapon.dy]).toEqual([0, 0]);
    // 武器畫在 hand 錨點上（握在原畫的手裡）
    const hand = base.slicePivotAt('hand', run.from + 1)!;
    const frame = sword.sheet.frame('weapon', run.from + 1)!;
    expect(hand.x).toBeGreaterThanOrEqual(frame.sourceRect.x - 2);
    expect(hand.x).toBeLessThanOrEqual(frame.sourceRect.x + frame.sourceRect.w + 2);

    expect(layerOf(composeAvatarFrame(base, [sword], ladder.from), 'weapon')).toBeUndefined();

    // 弓箭手：箭袋在人物後方（weapon_back）
    const bow = composeAvatarFrame(base, [part('weapon_0003')], 0);
    expect(bow.map((op) => op.layer)).toEqual(['weapon_back', 'body', 'weapon']);
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
      // 測試地圖的每個足場都要從出生點走得到（掛機才不會卡住）
      const spawn = map.portals.find((p) => p.type === 'spawn')!;
      const start = map.footholds.find((fh) =>
        fh.points.some((a, i) => {
          const b = fh.points[i + 1];
          return b !== undefined && spawn.x >= a[0] && spawn.x <= b[0] && Math.abs(a[1] + ((b[1] - a[1]) * (spawn.x - a[0])) / (b[0] - a[0]) - spawn.y) < 24;
        }),
      )!;
      const reachable = reachableFrom(map.nav, start.id);
      expect(map.footholds.filter((fh) => !reachable.has(fh.id)).map((fh) => fh.id), id).toEqual([]);
    }
  });
});
