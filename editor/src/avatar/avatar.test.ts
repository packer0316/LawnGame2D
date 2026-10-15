import { AVATAR_TAGS, parseAsepriteSheet } from '@lawn/shared';
import type { PaletteFile } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { findNearKeyColors, usedKeyColors } from './colors';
import { createAvatarItem, requiredTags } from './defaults';
import { validateBase, validateItem, validatePalettes } from './validate';

/** 依 AVATAR_TAGS 排出 67 幀的時間軸。 */
const TAGS = (() => {
  let from = 0;
  return Object.entries(AVATAR_TAGS).map(([name, t]) => {
    const tag = { name, from, to: from + t.frames - 1, direction: 'forward' };
    from += t.frames;
    return tag;
  });
})();
const TOTAL = TAGS[TAGS.length - 1]!.to + 1;
const tagFrom = (name: string) => TAGS.find((t) => t.name === name)!.from;

function frame(layer: string, index: number) {
  return {
    filename: `${layer}|${index}`,
    frame: { x: 0, y: 0, w: 8, h: 8 },
    rotated: false,
    trimmed: true,
    spriteSourceSize: { x: 60, y: 60, w: 8, h: 8 },
    sourceSize: { w: 128, h: 128 },
    duration: 100,
  };
}

function sheet(frames: [string, number][], slices = false) {
  return parseAsepriteSheet({
    frames: frames.map(([l, i]) => frame(l, i)),
    meta: {
      image: 'x.png',
      size: { w: 8, h: 8 },
      frameTags: TAGS,
      slices: slices
        ? ['head', 'torso', 'hand'].map((name) => ({ name, keys: [{ frame: 0, bounds: { x: 60, y: 60, w: 4, h: 4 }, pivot: { x: 2, y: 2 } }] }))
        : [],
    },
  });
}

const allFrames = (layer: string) => Array.from({ length: TOTAL }, (_, i) => [layer, i] as [string, number]);
const base = sheet([...allFrames('body'), ...allFrames('arm_front'), ['head', tagFrom('stand')], ['head', tagFrom('ladder')]], true);

describe('基礎身體', () => {
  it('完整的範本沒有問題', () => {
    expect(validateBase(base)).toEqual([]);
    expect(TOTAL).toBe(67);
  });

  it('缺少背面頭、缺少錨點', () => {
    const bad = sheet([...allFrames('body'), ...allFrames('arm_front'), ['head', tagFrom('stand')]]);
    const messages = validateBase(bad).map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining([expect.stringContaining('背面視角幀'), expect.stringContaining('缺少錨點 Slice「head」')]));
  });
});

describe('部件', () => {
  it('登錄預設值：分類、圖層、換色群組', () => {
    const s = sheet([['top', 0], ['sleeve', 0]]);
    expect(createAvatarItem('top_0001', s)).toMatchObject({ category: 'top', kind: 'pose', layers: ['top', 'sleeve'], recolor: 'dye' });
    const h = sheet([['hair_back', 0], ['hair_front', 0], ['hair_front@underHat', 0]]);
    expect(createAvatarItem('hair_0003', h)).toMatchObject({ category: 'hair', kind: 'anchor', layers: ['hair_back', 'hair_front'], recolor: 'hair' });
  });

  it('武器只需要通用動作與自己職業的攻擊動作', () => {
    const all = Object.keys(AVATAR_TAGS);
    expect(requiredTags({ category: 'weapon', classId: 'mage' }, all)).toEqual(all.filter((t) => !['swing1', 'swing2', 'swing3', 'shoot', 'throw', 'ladder', 'rope'].includes(t)));
    expect(requiredTags({ category: 'top' }, all)).toEqual(all);
  });

  it('姿勢部件缺少某些動作的姿勢圖', () => {
    // 只畫 stand 與 run
    const s = sheet([['top', tagFrom('stand')], ['top', tagFrom('run')], ['top', tagFrom('run') + 4]]);
    const item = { ...createAvatarItem('top_0001', s), layers: ['top' as const] };
    const errors = validateItem(item, s, base).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('jump');
    expect(errors[0]!.message).not.toContain('stand');
  });

  it('錨點部件：每個圖層要有正面圖，整件至少一個圖層有背面圖；臉與眼飾不需要背面', () => {
    // 背面畫在 hair_front 就夠了
    const ok = sheet([['hair_front', tagFrom('stand')], ['hair_back', tagFrom('stand')], ['hair_front', tagFrom('ladder')]]);
    expect(validateItem(createAvatarItem('hair_0001', ok), ok, base).filter((i) => i.severity === 'error')).toEqual([]);
    const noBack = sheet([['hair_front', tagFrom('stand')], ['hair_back', tagFrom('stand')]]);
    expect(validateItem(createAvatarItem('hair_0001', noBack), noBack, base).filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([
      expect.stringContaining('沒有背面圖'),
    ]);
    const glasses = sheet([['eye_acc', tagFrom('stand')]]);
    expect(validateItem(createAvatarItem('eyeAcc_0001', glasses), glasses, base).filter((i) => i.severity === 'error')).toEqual([]);
    const face = sheet([['face', tagFrom('stand')], ['face@blink', tagFrom('stand')]]);
    const faceItem = createAvatarItem('face_0001', face);
    const issues = validateItem(faceItem, face, base);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.map((i) => i.message)).toEqual([expect.stringContaining('face@hit'), expect.stringContaining('face@smile')]);
  });
});

describe('換色', () => {
  const keys = ['#f6c85f', '#d99a2b'];
  const px = (...colors: number[]) => new Uint8ClampedArray(colors.flatMap((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]));

  it('找出接近 Key 色但不相等的顏色', () => {
    const pixels = px(0xf6c85f, 0xf6c860, 0xf6c860, 0x123456, 0xd99a2b);
    expect(findNearKeyColors(pixels, keys)).toEqual([{ color: '#f6c860', key: '#f6c85f', pixels: 2 }]);
    expect(usedKeyColors(pixels, keys).sort()).toEqual(['#d99a2b', '#f6c85f']);
  });

  it('透明像素忽略', () => {
    const pixels = new Uint8ClampedArray([0xf6, 0xc8, 0x60, 0]);
    expect(findNearKeyColors(pixels, keys)).toEqual([]);
  });

  it('調色盤：階數與 Key 色階不同、不同群組共用 Key 色', () => {
    const file: PaletteFile = {
      schemaVersion: 1,
      keyRamps: { skin: ['#111111', '#222222'], hair: ['#222222'], eye: ['#333333'], dye: ['#444444'] },
      palettes: [{ id: 'palette_0001', group: 'skin', name: '膚', colors: ['#000000'] }],
    };
    const messages = validatePalettes(file).map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining([expect.stringContaining('有 1 階'), expect.stringContaining('#222222 同時出現在 skin 與 hair')]));
  });
});
