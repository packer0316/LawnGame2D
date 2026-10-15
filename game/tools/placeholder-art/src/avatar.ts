import { AVATAR_TAGS, AVATAR_TAG_NAMES, suggestedPoseFrames, type AvatarItem, type AvatarTag, type ClassId } from '@lawn/shared';
import { HERO_HANDS, heroPlacement, paintHero } from './painted';
import { Canvas, hex, type RGBA } from './raster';
import { writeJson, writePng, writeSheet, type SheetFrame, type SheetSpec } from './sheet';

/**
 * 角色與武器（SPEC v0.6 §4.3）：四職業共用同一個人物（森境旅人），不換裝、不換色，只換武器。
 * - avatar/base：人物（body 圖層）＋ head／torso／hand 三個 Slice（武器對齊 hand）
 * - avatar/items/weapon_000{1..4}：四職業的武器，只畫在姿勢幀
 *
 * 範本畫布 128×128，腳底在 (64, 120)，角色面向左（STUDIO_SPEC §4.1）。
 * 下面的「骨架」只用來算錨點與畫測試武器，人物本身是 painted.ts 的原畫。
 */
const SIZE = 128;
const FOOT_X = 64;
const FOOT_Y = 120;
const FWD = -1;

const LEG = 14;
const TORSO = 15;
const HEAD_R = 12;
const ARM = 11;

const DURATION: Record<AvatarTag, number> = {
  stand: 160,
  run: 80,
  jump: 100,
  fall: 100,
  land: 60,
  roll: 55,
  prone: 200,
  ladder: 120,
  rope: 120,
  swing1: 55,
  swing2: 55,
  swing3: 60,
  cast: 70,
  shoot: 70,
  throw: 50,
};

export interface TimelineTag {
  name: AvatarTag;
  from: number;
  to: number;
}

/** 範本時間軸：依 AVATAR_TAGS 的順序排。 */
export const TIMELINE: TimelineTag[] = (() => {
  let cursor = 0;
  return AVATAR_TAG_NAMES.map((name) => {
    const tag = { name, from: cursor, to: cursor + AVATAR_TAGS[name].frames - 1 };
    cursor = tag.to + 1;
    return tag;
  });
})();
export const FRAME_COUNT = TIMELINE.at(-1)!.to + 1;

function tagAt(frame: number): { tag: TimelineTag; i: number } {
  const tag = TIMELINE.find((t) => frame >= t.from && frame <= t.to)!;
  return { tag, i: frame - tag.from };
}

// ---------------------------------------------------------------------------
// 姿勢（錨點與測試武器用）
// ---------------------------------------------------------------------------

interface Pose {
  hipX: number;
  hipY: number;
  /** 肩膀相對臀部往前的偏移 */
  lean: number;
  headDx: number;
  headDy: number;
  /** 角度：0 = 垂下、90 = 往前平舉、180 = 舉高、負值 = 往後 */
  frontArm: number;
  weapon: number;
  /** 長柄武器（劍、法杖）的角度；沒有時用 weapon。依原畫手的方向決定，劍身要跟握拳的前臂垂直 */
  held?: number;
}

const pick = <T,>(list: readonly T[], i: number): T => list[Math.min(i, list.length - 1)]!;

function poseOf(frame: number): Pose {
  const { tag, i } = tagAt(frame);
  const base: Pose = { hipX: FOOT_X, hipY: FOOT_Y - LEG, lean: 0, headDx: 0, headDy: 0, frontArm: 12, weapon: 65 };
  switch (tag.name) {
    case 'stand': {
      const breath = pick([0, 0, 1, 1, 1, 0], i);
      return { ...base, hipY: base.hipY + breath, frontArm: 12 + breath * 2, weapon: 64 + breath * 2 };
    }
    case 'run': {
      const s = Math.sin((Math.floor(i / 2) / 4) * Math.PI * 2);
      const c = Math.cos((Math.floor(i / 2) / 4) * Math.PI * 2);
      return { ...base, hipY: base.hipY + (i % 2 === 0 ? 0 : -1) - Math.round(Math.abs(c)), lean: 2, frontArm: Math.round(18 - 40 * s), weapon: Math.round(18 - 40 * s) + 50 };
    }
    case 'jump':
      return { ...base, hipY: base.hipY - 1, frontArm: pick([140, 150], i), weapon: pick([150, 160], i) + 40 };
    case 'fall':
      return { ...base, frontArm: pick([105, 95], i), weapon: 140 };
    case 'land':
      return { ...base, hipY: base.hipY + pick([5, 2], i), frontArm: 30, weapon: 80 };
    case 'roll':
      return { ...base, hipY: base.hipY + 6 + pick([0, 1, 0, 1, 0, 0], i), lean: 5, headDy: 2, frontArm: -40, weapon: 10 };
    case 'prone':
      return { ...base, hipY: base.hipY + 9, lean: 9, headDy: 3, frontArm: 85, weapon: 95 };
    case 'ladder':
    case 'rope':
      return { ...base, frontArm: i % 2 ? 170 : 155, weapon: 0 };
    case 'swing1':
      return { ...base, lean: pick([-1, -2, 3, 3, 2], i), frontArm: pick([150, 175, 70, 20, 25], i), weapon: pick([200, 225, 110, 35, 45], i) };
    case 'swing2':
      return { ...base, lean: pick([-1, -2, 3, 4, 2], i), frontArm: pick([-30, -50, 90, 105, 70], i), weapon: pick([-10, -25, 95, 125, 95], i) };
    case 'swing3':
      return {
        ...base,
        hipY: base.hipY + pick([0, 0, 2, 3, 1], i),
        lean: pick([-2, -3, 5, 6, 3], i),
        frontArm: pick([160, 190, 120, 30, 20], i),
        weapon: pick([190, 225, 150, 15, 30], i),
      };
    case 'cast':
      return { ...base, frontArm: pick([20, 90, 150, 160, 150, 60], i), weapon: pick([170, 172, 176, 180, 176, 170], i), lean: pick([0, 0, 1, 2, 1, 0], i) };
    case 'shoot':
      return { ...base, frontArm: pick([60, 90, 90, 90, 85, 70], i), weapon: pick([60, 90, 90, 90, 85, 70], i) };
    case 'throw':
      return { ...base, lean: pick([-1, -2, 3, 3, 1], i), frontArm: pick([180, 205, 70, 50, 40], i), weapon: pick([180, 205, 70, 50, 40], i) };
  }
}

interface Rig {
  hip: [number, number];
  shoulder: [number, number];
  frontHand: [number, number];
  head: [number, number];
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const armEnd = (from: [number, number], angle: number, length: number): [number, number] => [
  Math.round(from[0] + Math.sin(rad(angle)) * length * FWD),
  Math.round(from[1] + Math.cos(rad(angle)) * length),
];

function rigOf(pose: Pose): Rig {
  const shoulder: [number, number] = [pose.hipX + pose.lean * FWD, pose.hipY - TORSO + 2];
  return {
    hip: [pose.hipX, pose.hipY],
    shoulder,
    frontHand: armEnd([shoulder[0] + FWD, shoulder[1]], pose.frontArm, ARM),
    head: [shoulder[0] + pose.headDx * FWD, shoulder[1] - HEAD_R - 1 + pose.headDy],
  };
}

const POSES = Array.from({ length: FRAME_COUNT }, (_, f) => poseOf(f));
const ALL_FRAMES = Array.from({ length: FRAME_COUNT }, (_, f) => f);

/**
 * 原畫跑步姿勢的握劍角度（0 = 朝下、90 = 朝前、180 = 朝上）。原畫跑步時拳頭在胸前往前伸、前臂接近水平，
 * 劍身要跟前臂垂直，所以朝上略往前傾；姿勢 2 的拳頭較低、前臂往前下，劍身跟著往前倒一些。
 * 舊骨架的角度是順著手臂算的，會變成劍跟前臂平行。
 */
const HERO_RUN_HELD: Partial<Record<number, number>> = { 1: 160, 2: 138, 3: 160 };

/** 骨架算出的點位，但手改用原畫標記的握點（HERO_HANDS），武器才會握在畫出來的手上。 */
const RIGS = POSES.map((pose, f) => {
  const rig = rigOf(pose);
  const { tag, i } = tagAt(f);
  const place = heroPlacement(tag.name, i);
  const hand = HERO_HANDS[place.pose];
  if (hand) rig.frontHand = [Math.round(place.x + hand.x * place.w), Math.round(place.y + hand.y * place.h)];
  if (tag.name === 'run' && HERO_RUN_HELD[place.pose] !== undefined) pose.held = HERO_RUN_HELD[place.pose];
  return rig;
});

// ---------------------------------------------------------------------------
// 武器（測試美術）
// ---------------------------------------------------------------------------

type Draw = (c: Canvas, rig: Rig, pose: Pose) => void;

const STEEL = [hex('#f4f7fb'), hex('#c9d2df'), hex('#8e9bb0')];

function drawWeapon(kind: ClassId): Draw {
  return (c, rig, pose) => {
    const [hx, hy] = rig.frontHand;
    const held = pose.held ?? pose.weapon;
    if (kind === 'warrior') {
      const tip = armEnd([hx, hy], held, 22);
      const guardA = armEnd([hx, hy], held + 90, 3);
      const guardB = armEnd([hx, hy], held - 90, 3);
      c.line(hx, hy, ...tip, STEEL[1]!, 3);
      c.line(hx, hy, ...tip, STEEL[0]!, 1);
      c.line(...guardA, ...guardB, hex('#b8862f'), 2);
      c.fillEllipse(hx, hy, 2, 2, hex('#70d5ce'));
      c.line(...armEnd([hx, hy], held + 180, 3), hx, hy, hex('#5b3a22'), 2);
    } else if (kind === 'mage') {
      const top = armEnd([hx, hy], held, 16);
      const bottom = armEnd([hx, hy], held + 180, 12);
      c.line(...bottom, ...top, hex('#7a5232'), 2);
      c.fillEllipse(top[0], top[1], 3, 3, hex('#b06cff'));
      c.fillPolygon(
        [
          [top[0], top[1] - 7],
          [top[0] + 4, top[1] - 2],
          [top[0], top[1] + 3],
          [top[0] - 4, top[1] - 2],
        ],
        hex('#79c9da'),
      );
      c.line(top[0], top[1] - 6, top[0] - 2, top[1] - 1, hex('#e5ffff'));
      c.set(top[0] - 1, top[1] - 1, hex('#f1dcff'));
    } else if (kind === 'archer') {
      const up = armEnd([hx, hy], pose.weapon - 90, 12);
      const down = armEnd([hx, hy], pose.weapon + 90, 12);
      const bulge = armEnd([hx, hy], pose.weapon, 4);
      c.line(...up, ...bulge, hex('#8a5a2b'), 2);
      c.line(...bulge, ...down, hex('#8a5a2b'), 2);
      c.line(...up, ...down, hex('#e9e2cf'), 1);
    } else {
      for (const spread of [-25, 0, 25]) {
        const tip = armEnd([hx, hy], pose.weapon + spread, 6);
        c.line(hx, hy, ...tip, STEEL[1]!, 1);
      }
      c.fillEllipse(hx, hy, 2, 2, hex('#4a3a5c'));
    }
  };
}

const drawQuiver: Draw = (c, rig) => {
  const [sx, sy] = rig.shoulder;
  c.line(sx - 4 * FWD, sy, sx - 7 * FWD, sy + 14, hex('#7a4a28'), 4);
  c.line(sx - 3 * FWD, sy - 3, sx - 2 * FWD, sy - 6, hex('#e9e2cf'), 1);
  c.line(sx - 5 * FWD, sy - 3, sx - 5 * FWD, sy - 7, hex('#e9e2cf'), 1);
};

// ---------------------------------------------------------------------------
// 匯出
// ---------------------------------------------------------------------------

/** 每個 Tag 的建議姿勢幀（時間軸幀號）。 */
function poseFrames(tags: readonly AvatarTag[]): number[] {
  return TIMELINE.filter((t) => tags.includes(t.name)).flatMap((t) => suggestedPoseFrames(t.name).map((i) => t.from + i));
}

/** Tag 內的每一幀。 */
function framesOf(tags: readonly AvatarTag[]): number[] {
  return TIMELINE.filter((t) => tags.includes(t.name)).flatMap((t) => Array.from({ length: t.to - t.from + 1 }, (_, i) => t.from + i));
}

interface LayerSpec {
  layer: string;
  frames: number[];
  draw: Draw;
  outline?: RGBA;
}

function layerFrames(spec: LayerSpec): SheetFrame[] {
  return spec.frames.map((f) => {
    const canvas = new Canvas(SIZE, SIZE);
    spec.draw(canvas, RIGS[f]!, POSES[f]!);
    if (spec.outline) canvas.outline(spec.outline);
    return { layer: spec.layer, index: f, canvas, durationMs: DURATION[tagAt(f).tag.name] };
  });
}

/** head／torso／hand 三個錨點，每幀一個 key。 */
function anchorSlices(): NonNullable<SheetSpec['slices']> {
  return [
    {
      name: 'head',
      color: '#0000ffff',
      keys: ALL_FRAMES.map((f) => {
        const [x, y] = RIGS[f]!.head;
        return { frame: f, bounds: { x: x - HEAD_R, y: y - HEAD_R, w: HEAD_R * 2 + 1, h: HEAD_R * 2 + 1 }, pivot: { x: HEAD_R, y: HEAD_R } };
      }),
    },
    {
      name: 'torso',
      color: '#00ff00ff',
      keys: ALL_FRAMES.map((f) => {
        const rig = RIGS[f]!;
        const top = rig.shoulder[1] - 1;
        const left = Math.min(rig.hip[0], rig.shoulder[0]) - 6;
        const w = Math.abs(rig.hip[0] - rig.shoulder[0]) + 13;
        return { frame: f, bounds: { x: left, y: top, w, h: rig.hip[1] - top + 2 }, pivot: { x: rig.hip[0] - left, y: rig.hip[1] - top } };
      }),
    },
    {
      name: 'hand',
      color: '#ff0000ff',
      keys: ALL_FRAMES.map((f) => {
        const [x, y] = RIGS[f]!.frontHand;
        return { frame: f, bounds: { x: x - 1, y: y - 1, w: 3, h: 3 }, pivot: { x: 1, y: 1 } };
      }),
    },
  ];
}

const COMMON: AvatarTag[] = ['stand', 'run', 'jump', 'fall', 'land', 'roll', 'prone'];
const CLASS_TAGS: Record<ClassId, AvatarTag[]> = {
  warrior: ['swing1', 'swing2', 'swing3'],
  mage: ['cast'],
  archer: ['shoot'],
  assassin: ['throw'],
};

const WEAPONS: { item: Omit<AvatarItem, 'schemaVersion' | 'sheet' | 'icon'>; layers: LayerSpec[] }[] = (['warrior', 'mage', 'archer', 'assassin'] as const).map(
  (classId, n) => ({
    item: {
      id: `weapon_000${n + 1}`,
      name: { warrior: '鐵劍', mage: '木杖', archer: '獵弓', assassin: '拳刃' }[classId],
      category: 'weapon',
      classId,
      kind: 'pose',
      layers: classId === 'archer' ? ['weapon', 'weapon_back'] : ['weapon'],
    },
    layers: [
      // 原畫主角是在幾張關鍵姿勢間切換，武器每幀都畫才握得住；爬繩梯時收起武器（STUDIO_SPEC §4.4）
      { layer: 'weapon', frames: framesOf([...COMMON, ...CLASS_TAGS[classId]]), draw: drawWeapon(classId), outline: hex('#2f2a3a') },
      ...(classId === 'archer' ? [{ layer: 'weapon_back', frames: poseFrames(AVATAR_TAG_NAMES), draw: drawQuiver, outline: hex('#3b2a22') }] : []),
    ],
  }),
);

/** 第一個有圖的幀裁成 32×32 圖示（必要時縮一半）。 */
function iconOf(spec: SheetSpec): Canvas {
  const first = spec.frames.find((f) => f.canvas.bounds());
  const icon = new Canvas(32, 32);
  if (!first) return icon;
  const b = first.canvas.bounds()!;
  const scale = b.w > 32 || b.h > 32 ? 2 : 1;
  const w = Math.ceil(b.w / scale);
  const h = Math.ceil(b.h / scale);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) icon.set(Math.floor((32 - w) / 2) + x, Math.floor((32 - h) / 2) + y, first.canvas.get(b.x + x * scale, b.y + y * scale));
  }
  return icon;
}

export function writeAvatar(contentDir: string): { itemIds: string[] } {
  const dir = `${contentDir}/avatar`;
  const tags = TIMELINE.map((t) => ({ name: t.name, from: t.from, to: t.to }));

  // 人物：四職業共用的森境旅人原畫
  const body: SheetFrame[] = ALL_FRAMES.map((frame) => {
    const { tag, i } = tagAt(frame);
    const canvas = new Canvas(SIZE, SIZE);
    paintHero(canvas, tag.name, i);
    return { layer: 'body', index: frame, canvas, durationMs: DURATION[tag.name] };
  });
  writeSheet(dir, 'base', { frames: body, tags, slices: anchorSlices(), layers: ['body'] });

  for (const def of WEAPONS) {
    const spec: SheetSpec = { frames: def.layers.flatMap(layerFrames), tags, layers: def.layers.map((l) => l.layer) };
    writeSheet(`${dir}/items`, def.item.id, spec);
    writePng(`${dir}/items/${def.item.id}.icon.png`, iconOf(spec));
    const item: AvatarItem = {
      schemaVersion: 1,
      ...def.item,
      sheet: `avatar/items/${def.item.id}.sheet.json`,
      icon: `avatar/items/${def.item.id}.icon.png`,
    };
    writeJson(`${dir}/items/${def.item.id}.json`, item);
  }

  return { itemIds: WEAPONS.map((def) => def.item.id) };
}
