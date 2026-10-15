import { parseAsepriteSheet } from '@lawn/shared';
import type { MonsterMathFile } from '@lawn/shared';
import { describe, expect, it } from 'vitest';
import { createMonsterDef } from './defaults';
import { footOrigin, guessTag, hitboxFromSlice, labelFromSlice, tagDurationMs } from './sheet';
import { validateMonster } from './validate';

/** 64×48 畫布、10 幀：Idle 0–3、Walk 4–7、Hurt 8、Death 9。 */
function rawSheet(opts: { slices?: boolean; tags?: [string, number, number][] } = {}) {
  const tags = opts.tags ?? [
    ['Idle', 0, 3],
    ['Walk', 4, 7],
    ['Hurt', 8, 8],
    ['Death', 9, 9],
  ];
  return {
    frames: Array.from({ length: 10 }, (_, i) => ({
      filename: String(i),
      frame: { x: i * 30, y: 0, w: 30, h: 36 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 17, y: 12, w: 30, h: 36 },
      sourceSize: { w: 64, h: 48 },
      duration: i === 8 ? 400 : 100,
    })),
    meta: {
      image: 'mob_0001.png',
      size: { w: 300, h: 36 },
      frameTags: tags.map(([name, from, to]) => ({ name, from, to, direction: 'forward' })),
      slices: opts.slices
        ? [
            { name: 'hitbox', keys: [{ frame: 0, bounds: { x: 20, y: 16, w: 24, h: 32 } }] },
            { name: 'label', keys: [{ frame: 0, bounds: { x: 30, y: 6, w: 4, h: 4 }, pivot: { x: 2, y: 2 } }] },
          ]
        : [],
    },
  };
}

const math: MonsterMathFile = { schemaVersion: 1, monsters: [{ id: 'mob_0001', tier: 'normal', multiplier: [2, 5] }] };

describe('怪物 sheet', () => {
  it('原點在畫布底邊中央；Slice 換算成相對腳底', () => {
    const sheet = parseAsepriteSheet(rawSheet({ slices: true }));
    expect(footOrigin(sheet)).toEqual({ x: 32, y: 48 });
    expect(hitboxFromSlice(sheet)).toEqual({ x: -12, y: -32, w: 24, h: 32 });
    expect(labelFromSlice(sheet)).toEqual({ x: 0, y: -40 });
  });

  it('Tag 名稱自動對應（別名、不分大小寫）', () => {
    const sheet = parseAsepriteSheet(rawSheet());
    expect([guessTag(sheet, 'move'), guessTag(sheet, 'idle'), guessTag(sheet, 'hit'), guessTag(sheet, 'die'), guessTag(sheet, 'appear')]).toEqual([
      'Walk',
      'Idle',
      'Hurt',
      'Death',
      undefined,
    ]);
  });

  it('Tag 總時間可套用覆寫', () => {
    const sheet = parseAsepriteSheet(rawSheet());
    const hurt = sheet.tags.get('Hurt')!;
    expect(tagDurationMs(sheet, hurt)).toBe(400);
    expect(tagDurationMs(sheet, hurt, { '8': 200 })).toBe(200);
  });
});

describe('createMonsterDef + validateMonster', () => {
  it('沒有 Slice 時用 idle 的實際範圍當判定框，預設設定沒有錯誤', () => {
    const sheet = parseAsepriteSheet(rawSheet());
    const def = createMonsterDef('mob_0001', sheet);
    expect(def.hitbox).toEqual({ x: -15, y: -36, w: 30, h: 36 });
    expect(def.tags).toEqual({ move: 'Walk', idle: 'Idle', hit: 'Hurt', die: 'Death' });
    const issues = validateMonster({ ...def, fx: { ...def.fx, coinFrame: 0 } }, sheet, math);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    // 受擊 400ms > 300ms
    expect(issues.some((i) => i.message.includes('受擊動作總長 400ms'))).toBe(true);
  });

  it('缺少必備動作會是錯誤', () => {
    const sheet = parseAsepriteSheet(rawSheet({ tags: [['idle', 0, 3], ['move', 4, 7], ['hit', 8, 8]] }));
    const def = createMonsterDef('mob_0001', sheet);
    const errors = validateMonster(def, sheet, math).filter((i) => i.severity === 'error');
    expect(errors.map((e) => e.message)).toContain('mob_0001：缺少必備動作 die 的 Tag 對應');
  });

  it('Tag 對應到不存在的名稱、噴金幣幀超出 die、數值不存在', () => {
    const sheet = parseAsepriteSheet(rawSheet());
    const def = { ...createMonsterDef('mob_0001', sheet), mathId: 'mob_0099' };
    def.tags = { ...def.tags, move: 'Run' };
    def.fx = { ...def.fx, coinFrame: 3 };
    const messages = validateMonster(def, sheet, math)
      .filter((i) => i.severity === 'error')
      .map((i) => i.message);
    expect(messages).toEqual([
      expect.stringContaining('動作 move 對應的 Tag「Run」不在 sheet 中'),
      expect.stringContaining('噴金幣的幀 3 超過 die 的長度'),
      'mob_0001：數值檔沒有 mob_0099',
    ]);
  });

  it('等級規則：倍率範圍與尺寸是警告', () => {
    const sheet = parseAsepriteSheet(rawSheet());
    const def = { ...createMonsterDef('mob_0001', sheet), fx: { coinFrame: 0, coinCount: 1 } };
    const boss: MonsterMathFile = { schemaVersion: 1, monsters: [{ id: 'mob_0001', tier: 'boss', multiplier: 50 }] };
    const warnings = validateMonster(def, sheet, boss).map((i) => i.message);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('boss 的倍率建議在 100–500×'),
        expect.stringContaining('boss 建議顯示血條'),
        expect.stringContaining('Boss 建議有登場動作'),
        expect.stringContaining('身高建議 128–192'),
      ]),
    );
  });
});
