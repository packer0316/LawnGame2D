import type { MonsterDef, MonsterMathFile } from '@lawn/shared';
import { Canvas } from './raster';
import { writeJson, writeSheet, type SheetFrame } from './sheet';
import { paintCreature } from './painted';

/** 怪物原點 = 畫布底邊中心（STUDIO_SPEC §8.1），預設面向左。 */

type Action = 'idle' | 'move' | 'hit' | 'die' | 'appear';

interface MonsterArt {
  id: string;
  name: string;
  w: number;
  h: number;
  frames: Partial<Record<Action, number>>;
  duration: Partial<Record<Action, number>>;
  hitbox: { x: number; y: number; w: number; h: number };
  label: { x: number; y: number };
  def: Omit<MonsterDef, 'schemaVersion' | 'id' | 'name' | 'sheet' | 'tags' | 'hitbox' | 'labelOffset' | 'mathId'>;
}

const MONSTERS: MonsterArt[] = [
  {
    id: 'mob_0001',
    name: '嫩芽史萊姆',
    w: 40,
    h: 32,
    frames: { idle: 4, move: 6, hit: 2, die: 8 },
    duration: { idle: 160, move: 90, hit: 80, die: 70 },
    hitbox: { x: 8, y: 12, w: 24, h: 20 },
    label: { x: 20, y: 8 },
    def: {
      behavior: { move: 'ground', speed: 28, idleSec: [1, 3], moveSec: [2, 4], knockback: 6 },
      fx: { hit: 'hit_spark', die: 'dust', coinFrame: 2, coinCount: 2 },
      showHpBar: false,
    },
  },
  {
    id: 'mob_0002',
    name: '苔蘚蘑菇',
    w: 40,
    h: 44,
    frames: { idle: 4, move: 6, hit: 2, die: 7 },
    duration: { idle: 170, move: 100, hit: 80, die: 75 },
    hitbox: { x: 6, y: 12, w: 28, h: 32 },
    label: { x: 20, y: 6 },
    def: {
      behavior: { move: 'ground', speed: 22, idleSec: [1, 3], moveSec: [2, 5], knockback: 5 },
      fx: { hit: 'hit_spark', die: 'dust', coinFrame: 2, coinCount: 3 },
      showHpBar: false,
    },
  },
  {
    id: 'mob_0003',
    name: '紫耳蝙蝠',
    w: 48,
    h: 36,
    frames: { idle: 4, move: 6, hit: 2, die: 6 },
    duration: { idle: 110, move: 70, hit: 80, die: 80 },
    hitbox: { x: 12, y: 6, w: 24, h: 20 },
    label: { x: 24, y: 2 },
    def: {
      behavior: { move: 'fly', speed: 40, idleSec: [0.5, 1.5], moveSec: [2, 4], knockback: 8 },
      fx: { hit: 'hit_spark', die: 'dust', coinFrame: 1, coinCount: 3 },
      showHpBar: false,
    },
  },
  {
    id: 'mob_0004',
    name: '符文石像',
    w: 80,
    h: 96,
    frames: { idle: 4, move: 8, hit: 2, die: 8 },
    duration: { idle: 180, move: 110, hit: 90, die: 90 },
    hitbox: { x: 14, y: 10, w: 52, h: 86 },
    label: { x: 40, y: 4 },
    def: {
      behavior: { move: 'ground', speed: 16, idleSec: [1, 2], moveSec: [3, 6], knockback: 2 },
      fx: { hit: 'hit_spark', die: 'dust', coinFrame: 3, coinCount: 8, light: { color: '#ff7a3d', radius: 60 } },
      showHpBar: true,
    },
  },
  {
    id: 'mob_0005',
    name: '發條炸彈',
    w: 40,
    h: 40,
    frames: { idle: 4, move: 6, hit: 2, die: 8 },
    duration: { idle: 120, move: 90, hit: 80, die: 60 },
    hitbox: { x: 8, y: 14, w: 24, h: 26 },
    label: { x: 20, y: 4 },
    def: {
      behavior: { move: 'ground', speed: 26, idleSec: [1, 2], moveSec: [2, 4], knockback: 6 },
      fx: { hit: 'hit_spark', die: 'explosion', coinFrame: 1, coinCount: 5, light: { color: '#ffb347', radius: 40 } },
      showHpBar: false,
    },
  },
  {
    id: 'mob_0006',
    name: '古樹守衛',
    w: 200,
    h: 200,
    frames: { idle: 6, move: 8, hit: 3, die: 10, appear: 8 },
    duration: { idle: 160, move: 120, hit: 90, die: 110, appear: 120 },
    hitbox: { x: 50, y: 20, w: 100, h: 180 },
    label: { x: 100, y: 6 },
    def: {
      behavior: { move: 'ground', speed: 10, idleSec: [2, 4], moveSec: [2, 4], knockback: 0 },
      fx: { hit: 'hit_spark', die: 'explosion', coinFrame: 4, coinCount: 30, light: { color: '#ffe066', radius: 120 } },
      showHpBar: true,
    },
  },
];

const ORDER: Action[] = ['idle', 'move', 'hit', 'die', 'appear'];

export function writeMonsters(contentDir: string): { monsterIds: string[] } {
  const dir = `${contentDir}/monsters`;
  for (const art of MONSTERS) {
    const frames: SheetFrame[] = [];
    const tags: { name: string; from: number; to: number }[] = [];
    let cursor = 0;
    for (const action of ORDER) {
      const count = art.frames[action];
      if (!count) continue;
      tags.push({ name: action, from: cursor, to: cursor + count - 1 });
      for (let i = 0; i < count; i += 1) {
        const canvas = new Canvas(art.w, art.h);
        paintCreature(canvas, MONSTERS.indexOf(art), action, i, count === 1 ? 1 : i / (count - 1));
        frames.push({ layer: null, index: cursor + i, canvas, durationMs: art.duration[action] ?? 100 });
      }
      cursor += count;
    }
    writeSheet(dir, art.id, {
      frames,
      tags,
      slices: [
        { name: 'hitbox', color: '#ff0000ff', keys: [{ frame: 0, bounds: art.hitbox }] },
        { name: 'label', color: '#ffff00ff', keys: [{ frame: 0, bounds: { x: art.label.x - 2, y: art.label.y - 2, w: 5, h: 5 }, pivot: { x: 2, y: 2 } }] },
      ],
    });

    const originX = art.w / 2;
    const originY = art.h;
    const def: MonsterDef = {
      schemaVersion: 1,
      id: art.id,
      name: art.name,
      sheet: `monsters/${art.id}.sheet.json`,
      tags: { move: 'move', idle: 'idle', hit: 'hit', die: 'die', ...(art.frames.appear ? { appear: 'appear' } : {}) },
      hitbox: { x: art.hitbox.x - originX, y: art.hitbox.y - originY, w: art.hitbox.w, h: art.hitbox.h },
      labelOffset: { x: art.label.x - originX, y: art.label.y - originY },
      mathId: art.id,
      ...art.def,
    };
    writeJson(`${dir}/${art.id}.json`, def);
  }

  const math: MonsterMathFile = {
    schemaVersion: 1,
    monsters: [
      { id: 'mob_0001', tier: 'normal', multiplier: 2 },
      { id: 'mob_0002', tier: 'normal', multiplier: [3, 5] },
      { id: 'mob_0003', tier: 'normal', multiplier: [5, 10] },
      { id: 'mob_0004', tier: 'elite', multiplier: [30, 60] },
      { id: 'mob_0005', tier: 'special', multiplier: 15, feature: 'bomb' },
      { id: 'mob_0006', tier: 'boss', multiplier: [100, 300] },
    ],
  };
  writeJson(`${contentDir}/math/monsters.math.json`, math);

  return { monsterIds: MONSTERS.map((m) => m.id) };
}
