import { AVATAR_TAGS, parseAsepriteSheet } from '@lawn/shared';
import type { AvatarItem } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { createWeapon, guessClass, requiredTags } from './defaults';
import { validateBase, validateItem } from './validate';

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

function sheet(frames: [string, number][], slices: string[] = []) {
  return parseAsepriteSheet({
    frames: frames.map(([l, i]) => frame(l, i)),
    meta: {
      image: 'x.png',
      size: { w: 8, h: 8 },
      frameTags: TAGS,
      slices: slices.map((name) => ({ name, keys: [{ frame: 0, bounds: { x: 60, y: 60, w: 4, h: 4 }, pivot: { x: 2, y: 2 } }] })),
    },
  });
}

const allFrames = (layer: string) => Array.from({ length: TOTAL }, (_, i) => [layer, i] as [string, number]);
const base = sheet([...allFrames('body'), ...allFrames('arm_front')], ['hand', 'torso']);

/** 每個 Tag 的第一幀畫一張武器。 */
const weaponFrames = (tags: string[]) => tags.map((t) => ['weapon', tagFrom(t)] as [string, number]);
const COMMON = ['stand', 'run', 'jump', 'fall', 'land', 'roll', 'prone'];

describe('角色', () => {
  it('完整的角色檔沒有問題（67 幀、hand／torso 錨點）', () => {
    expect(TOTAL).toBe(67);
    expect(validateBase(base)).toEqual([]);
  });

  it('缺少 body 幀與錨點', () => {
    const bad = sheet(allFrames('body').filter(([, i]) => i !== tagFrom('run') + 2), ['hand']);
    expect(validateBase(bad).map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('run 的第 2 幀沒有畫 body'), expect.stringContaining('缺少錨點 Slice「torso」')]),
    );
  });
});

describe('武器', () => {
  it('登錄預設值：依畫了哪個職業的攻擊動作猜職業', () => {
    const s = sheet(weaponFrames([...COMMON, 'cast']));
    expect(guessClass(s)).toBe('mage');
    expect(createWeapon('weapon_0002', s)).toMatchObject({ category: 'weapon', kind: 'pose', classId: 'mage', layers: ['weapon'] });
  });

  it('需要的動作：通用（爬繩梯除外）＋ 自己職業的攻擊', () => {
    const all = Object.keys(AVATAR_TAGS);
    expect(requiredTags({ classId: 'warrior' }, all)).toEqual([...COMMON, 'swing1', 'swing2', 'swing3']);
  });

  it('畫齊的武器沒有錯誤；缺動作、缺職業、用錯圖層都是錯誤', () => {
    const s = sheet(weaponFrames([...COMMON, 'shoot']));
    const ok: AvatarItem = { ...createWeapon('weapon_0003', s), classId: 'archer' };
    expect(validateItem(ok, s, base)).toEqual([]);

    const missing = sheet(weaponFrames(['stand', 'run', 'shoot']));
    expect(validateItem({ ...ok }, missing, base).map((i) => i.message)).toEqual([expect.stringContaining('jump、fall、land、roll、prone')]);

    const { classId: _c, ...noClass } = ok;
    expect(validateItem(noClass, s, base).map((i) => i.message)).toContain('weapon_0003：沒有設定職業');

    expect(validateItem({ ...ok, layers: ['weapon', 'top'] }, s, base).map((i) => i.message)).toContain('weapon_0003：武器只能用 weapon、weapon_back 圖層，不能用 top');
  });

  it('舊的換裝部件只警告、不擋匯出', () => {
    const s = sheet([['top', 0]]);
    const top: AvatarItem = { schemaVersion: 1, id: 'top_0001', name: '布衣', category: 'top', kind: 'pose', sheet: 'x', layers: ['top'], icon: '' };
    expect(validateItem(top, s, base)).toEqual([expect.objectContaining({ severity: 'warning' })]);
  });
});
