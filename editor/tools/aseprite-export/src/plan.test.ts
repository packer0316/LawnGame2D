import { describe, expect, it } from 'vitest';
import { asepriteArgs, fixSheetJson, planJob } from './plan';

describe('planJob', () => {
  it('依資料夾決定輸出位置與檔名（STUDIO_SPEC §8）', () => {
    expect(planJob('art/avatar/avatar_base.aseprite')).toEqual({
      kind: 'avatarBase',
      source: 'art/avatar/avatar_base.aseprite',
      png: 'content/avatar/base.png',
      data: 'content/avatar/base.sheet.json',
    });
    expect(planJob('art\\monsters\\mob_0003.aseprite')?.data).toBe('content/monsters/mob_0003.sheet.json');
    expect(planJob('art/avatar/items/top_0001.aseprite')?.kind).toBe('avatarItem');
    expect(planJob('art/maps/tilesets/forest.aseprite')).toEqual({ kind: 'tileset', source: 'art/maps/tilesets/forest.aseprite', png: 'content/tilesets/forest.png' });
    expect(planJob('art/maps/tilesets/forest_n.png')?.png).toBe('content/tilesets/forest_n.png');
    expect(planJob('art/maps/world.ldtk')).toBeNull();
    expect(planJob('art/monsters/notes.txt')).toBeNull();
  });
});

describe('asepriteArgs', () => {
  it('部件：分圖層、略過空白幀、忽略 _ 開頭的參考圖層、{layer}|{frame}', () => {
    const args = asepriteArgs(planJob('art/avatar/items/top_0001.aseprite')!, ['_body', 'top', 'sleeve', 'group/_guide']);
    expect(args).toEqual(
      expect.arrayContaining(['--split-layers', '--ignore-empty', '--ignore-layer', '_body', 'group/_guide', '{layer}|{frame}']),
    );
    expect(args.indexOf('art/avatar/items/top_0001.aseprite')).toBeLessThan(args.indexOf('--sheet'));
    expect(args.slice(-4)).toEqual(['--sheet', 'content/avatar/items/top_0001.png', '--data', 'content/avatar/items/top_0001.sheet.json']);
  });

  it('怪物：一般 sheet、{frame}、不分圖層', () => {
    const args = asepriteArgs(planJob('art/monsters/mob_0001.aseprite')!, ['body']);
    expect(args).not.toContain('--split-layers');
    expect(args).toContain('{frame}');
    expect(args).toEqual(expect.arrayContaining(['--format', 'json-array', '--list-tags', '--list-slices', '--trim']));
  });

  it('tileset：只存第一幀的平面圖', () => {
    expect(asepriteArgs(planJob('art/maps/tilesets/cave.aseprite')!, [])).toEqual([
      '-b',
      '--oneframe',
      'art/maps/tilesets/cave.aseprite',
      '--save-as',
      'content/tilesets/cave.png',
    ]);
  });
});

describe('fixSheetJson', () => {
  it('meta.image 改成只有檔名', () => {
    const out = JSON.parse(fixSheetJson(JSON.stringify({ frames: [], meta: { image: 'D:\\x\\content\\monsters\\mob_0001.png' } }), 'content/monsters/mob_0001.png'));
    expect(out.meta.image).toBe('mob_0001.png');
  });
});
