import {
  AVATAR_TAGS,
  AVATAR_TAG_NAMES,
  suggestedPoseFrames,
  variantLayer,
  type AvatarItem,
  type AvatarTag,
  type ClassId,
  type PaletteFile,
} from '@lawn/shared';
import { Canvas, hex, shade, type RGBA } from './raster';
import { writeJson, writePng, writeSheet, type SheetFrame, type SheetSpec } from './sheet';
import { paintHero } from './painted';

/** 範本畫布 128×128，腳底在 (64, 120)，角色面向左（STUDIO_SPEC §4.1）。 */
const SIZE = 128;
const FOOT_X = 64;
const FOOT_Y = 120;
const FWD = -1;

const LEG = 14;
const TORSO = 15;
const HEAD_R = 12;
const ARM = 11;

/** Key 色階：由亮到暗，最後一階當描邊。這些顏色只能用在需要換色的地方。 */
export const KEY = {
  skin: ['#fde3cf', '#f5c9a8', '#dfa07c', '#a9674a'],
  hair: ['#fff1a8', '#f6c85f', '#d99a2b', '#a5631c', '#6b3a12'],
  eye: ['#9fd8ff', '#3b82c4', '#1d3d6b'],
  dye: ['#e8eef7', '#b7c4d9', '#7d8ca8', '#4b5670'],
} as const;
const ramp = (colors: readonly string[]) => colors.map((c) => hex(c));
const SKIN = ramp(KEY.skin);
const HAIR = ramp(KEY.hair);
const EYE = ramp(KEY.eye);
const DYE = ramp(KEY.dye);
const WHITE = hex('#ffffff');
const INK = hex('#2a1f2e');

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
// 姿勢
// ---------------------------------------------------------------------------

interface Pose {
  hipX: number;
  hipY: number;
  /** 肩膀相對臀部往前的偏移 */
  lean: number;
  headDx: number;
  headDy: number;
  /** 腳：相對臀部往前的偏移、離地高度 */
  front: { dx: number; lift: number };
  back: { dx: number; lift: number };
  /** 角度：0 = 垂下、90 = 往前平舉、180 = 舉高、負值 = 往後 */
  frontArm: number;
  backArm: number;
  weapon: number;
  view: 'front' | 'back';
}

const pick = <T,>(list: readonly T[], i: number): T => list[Math.min(i, list.length - 1)]!;

function poseOf(frame: number): Pose {
  const { tag, i } = tagAt(frame);
  const base: Pose = {
    hipX: FOOT_X,
    hipY: FOOT_Y - LEG,
    lean: 0,
    headDx: 0,
    headDy: 0,
    front: { dx: 3, lift: 0 },
    back: { dx: -3, lift: 0 },
    frontArm: 12,
    backArm: 8,
    weapon: 65,
    view: AVATAR_TAGS[tag.name].view,
  };
  switch (tag.name) {
    case 'stand': {
      const breath = pick([0, 0, 1, 1, 1, 0], i);
      return { ...base, hipY: base.hipY + breath, frontArm: 12 + breath * 2, backArm: 8 - breath, weapon: 64 + breath * 2 };
    }
    case 'run': {
      // 每兩幀共用同一個腳步位置，第二幀只改上下起伏（姿勢部件因此對得準）。
      const phase = (Math.floor(i / 2) / 4) * Math.PI * 2;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const bob = i % 2 === 0 ? 0 : -1;
      return {
        ...base,
        hipY: base.hipY + bob - Math.round(Math.abs(c)),
        lean: 2,
        front: { dx: Math.round(6 * s) + 1, lift: Math.max(0, Math.round(5 * c)) },
        back: { dx: Math.round(-6 * s) - 1, lift: Math.max(0, Math.round(-5 * c)) },
        frontArm: Math.round(18 - 40 * s),
        backArm: Math.round(18 + 40 * s),
        weapon: Math.round(18 - 40 * s) + 50,
      };
    }
    case 'jump':
      return { ...base, hipY: base.hipY - 1, front: { dx: 4, lift: 7 }, back: { dx: -2, lift: 4 }, frontArm: pick([140, 150], i), backArm: 120, weapon: pick([150, 160], i) + 40 };
    case 'fall':
      return { ...base, front: { dx: 3, lift: 2 }, back: { dx: -4, lift: 0 }, frontArm: pick([105, 95], i), backArm: 80, weapon: 140 };
    case 'land': {
      const crouch = pick([5, 2], i);
      return { ...base, hipY: base.hipY + crouch, front: { dx: 5, lift: 0 }, back: { dx: -5, lift: 0 }, frontArm: 30, backArm: 20, weapon: 80 };
    }
    case 'roll': {
      const bob = pick([0, 1, 0, 1, 0, 0], i);
      return {
        ...base,
        hipY: base.hipY + 6 + bob,
        lean: 5,
        headDy: 2,
        front: { dx: 9, lift: 0 },
        back: { dx: -9, lift: 2 },
        frontArm: -40,
        backArm: -55,
        weapon: 10,
      };
    }
    case 'prone':
      return { ...base, hipY: base.hipY + 9, lean: 9, headDy: 3, front: { dx: 11, lift: 0 }, back: { dx: -11, lift: 0 }, frontArm: 85, backArm: 75, weapon: 95 };
    case 'ladder':
    case 'rope': {
      const alt = i % 2;
      const spread = tag.name === 'ladder' ? 4 : 1;
      return {
        ...base,
        front: { dx: spread, lift: alt ? 4 : 0 },
        back: { dx: -spread, lift: alt ? 0 : 4 },
        frontArm: alt ? 170 : 155,
        backArm: alt ? 155 : 170,
        weapon: 0,
      };
    }
    case 'swing1':
      return {
        ...base,
        lean: pick([-1, -2, 3, 3, 2], i),
        front: { dx: 5, lift: 0 },
        back: { dx: -5, lift: 0 },
        frontArm: pick([150, 175, 70, 20, 25], i),
        backArm: pick([20, 10, 30, 30, 20], i),
        weapon: pick([200, 225, 110, 35, 45], i),
      };
    case 'swing2':
      return {
        ...base,
        lean: pick([-1, -2, 3, 4, 2], i),
        front: { dx: 5, lift: 0 },
        back: { dx: -5, lift: 0 },
        frontArm: pick([-30, -50, 90, 105, 70], i),
        backArm: pick([30, 40, -10, -20, 0], i),
        weapon: pick([-10, -25, 95, 125, 95], i),
      };
    case 'swing3':
      return {
        ...base,
        hipY: base.hipY + pick([0, 0, 2, 3, 1], i),
        lean: pick([-2, -3, 5, 6, 3], i),
        front: { dx: pick([5, 5, 8, 9, 7], i), lift: 0 },
        back: { dx: -6, lift: 0 },
        frontArm: pick([160, 190, 120, 30, 20], i),
        backArm: pick([150, 170, 60, 0, 10], i),
        weapon: pick([190, 225, 150, 15, 30], i),
      };
    case 'cast':
      return {
        ...base,
        frontArm: pick([20, 90, 150, 160, 150, 60], i),
        backArm: pick([10, 30, 50, 60, 50, 20], i),
        weapon: pick([170, 172, 176, 180, 176, 170], i),
        lean: pick([0, 0, 1, 2, 1, 0], i),
      };
    case 'shoot':
      return {
        ...base,
        front: { dx: 5, lift: 0 },
        back: { dx: -5, lift: 0 },
        frontArm: pick([60, 90, 90, 90, 85, 70], i),
        backArm: pick([40, 85, 95, 95, 60, 40], i),
        weapon: pick([60, 90, 90, 90, 85, 70], i),
      };
    case 'throw':
      return {
        ...base,
        lean: pick([-1, -2, 3, 3, 1], i),
        front: { dx: 5, lift: 0 },
        back: { dx: -5, lift: 0 },
        frontArm: pick([180, 205, 70, 50, 40], i),
        backArm: pick([20, 10, 40, 30, 20], i),
        weapon: pick([180, 205, 70, 50, 40], i),
      };
  }
}

// ---------------------------------------------------------------------------
// 骨架點位
// ---------------------------------------------------------------------------

interface Rig {
  hip: [number, number];
  shoulder: [number, number];
  frontShoulder: [number, number];
  backShoulder: [number, number];
  frontHand: [number, number];
  backHand: [number, number];
  frontHip: [number, number];
  backHip: [number, number];
  frontFoot: [number, number];
  backFoot: [number, number];
  frontKnee: [number, number];
  backKnee: [number, number];
  head: [number, number];
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const armEnd = (from: [number, number], angle: number, length: number): [number, number] => [
  Math.round(from[0] + Math.sin(rad(angle)) * length * FWD),
  Math.round(from[1] + Math.cos(rad(angle)) * length),
];

function knee(hip: [number, number], foot: [number, number]): [number, number] {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = Math.hypot(dx, dy);
  const half = LEG / 2;
  const bend = d >= LEG ? 0 : Math.sqrt(half * half - (d / 2) * (d / 2));
  // 膝蓋往前彎
  return [Math.round(hip[0] + dx / 2 + bend * FWD), Math.round(hip[1] + dy / 2)];
}

function rigOf(pose: Pose): Rig {
  const hip: [number, number] = [pose.hipX, pose.hipY];
  const shoulder: [number, number] = [pose.hipX + pose.lean * FWD, pose.hipY - TORSO + 2];
  const frontShoulder: [number, number] = [shoulder[0] + FWD, shoulder[1]];
  const backShoulder: [number, number] = [shoulder[0] - 2 * FWD, shoulder[1]];
  const frontHip: [number, number] = [hip[0] + 2 * FWD, hip[1]];
  const backHip: [number, number] = [hip[0] - 2 * FWD, hip[1]];
  const frontFoot: [number, number] = [pose.hipX + pose.front.dx * FWD, FOOT_Y - pose.front.lift];
  const backFoot: [number, number] = [pose.hipX + pose.back.dx * FWD, FOOT_Y - pose.back.lift];
  return {
    hip,
    shoulder,
    frontShoulder,
    backShoulder,
    frontHand: armEnd(frontShoulder, pose.frontArm, ARM),
    backHand: armEnd(backShoulder, pose.backArm, ARM),
    frontHip,
    backHip,
    frontFoot,
    backFoot,
    frontKnee: knee(frontHip, frontFoot),
    backKnee: knee(backHip, backFoot),
    head: [shoulder[0] + pose.headDx * FWD, shoulder[1] - HEAD_R - 1 + pose.headDy],
  };
}

const POSES = Array.from({ length: FRAME_COUNT }, (_, f) => poseOf(f));
const RIGS = POSES.map(rigOf);

// ---------------------------------------------------------------------------
// 畫各部件
// ---------------------------------------------------------------------------

type Draw = (c: Canvas, rig: Rig, pose: Pose) => void;

function layerCanvas(draw: Draw, rig: Rig, pose: Pose, outline?: RGBA): Canvas {
  const canvas = new Canvas(SIZE, SIZE);
  draw(canvas, rig, pose);
  if (outline) canvas.outline(outline);
  return canvas;
}

function torsoPolygon(rig: Rig, widen: number): [number, number][] {
  const [hx, hy] = rig.hip;
  const [sx, sy] = rig.shoulder;
  return [
    [hx - 5 - widen, hy + 1],
    [hx + 5 + widen, hy + 1],
    [sx + 5 + widen, sy - 1],
    [sx - 5 - widen, sy - 1],
  ];
}

const drawBody: Draw = (c, rig) => {
  c.line(...rig.backShoulder, ...rig.backHand, SKIN[2]!, 3);
  c.line(...rig.backHip, ...rig.backKnee, SKIN[2]!, 4);
  c.line(...rig.backKnee, ...rig.backFoot, SKIN[2]!, 4);
  c.fillPolygon(torsoPolygon(rig, 0), SKIN[1]!);
  c.line(rig.hip[0] - 3 * FWD, rig.hip[1], rig.shoulder[0] - 3 * FWD, rig.shoulder[1], SKIN[2]!, 2);
  c.line(...rig.frontHip, ...rig.frontKnee, SKIN[1]!, 4);
  c.line(...rig.frontKnee, ...rig.frontFoot, SKIN[1]!, 4);
};

const drawArmFront: Draw = (c, rig) => {
  c.line(...rig.frontShoulder, ...rig.frontHand, SKIN[1]!, 3);
  c.fillEllipse(rig.frontHand[0], rig.frontHand[1], 2, 2, SKIN[0]!);
};

function drawHead(view: 'front' | 'back'): Draw {
  return (c, rig) => {
    const [x, y] = rig.head;
    c.fillEllipse(x, y, HEAD_R, HEAD_R - 1, SKIN[1]!);
    c.fillEllipse(x - 2, y - 2, HEAD_R - 2, HEAD_R - 3, SKIN[0]!);
    c.fillEllipse(x - 3 * FWD, y + 3, HEAD_R - 4, HEAD_R - 5, SKIN[1]!);
    if (view === 'front') {
      c.fillEllipse(x - (HEAD_R - 1) * FWD, y + 1, 2, 3, SKIN[2]!); // 耳朵在後側
      c.fillEllipse(x + 4 * FWD, y - 4, 4, 3, SKIN[0]!); // 額頭亮面
    } else {
      c.fillEllipse(x - HEAD_R, y + 1, 2, 3, SKIN[2]!);
      c.fillEllipse(x + HEAD_R, y + 1, 2, 3, SKIN[2]!);
    }
  };
}

type Expression = 'default' | 'blink' | 'hit' | 'smile';

function drawFace(style: 'round' | 'sharp', expression: Expression): Draw {
  return (c, rig) => {
    const [hx, hy] = rig.head;
    const eyes: [number, number][] = [
      [hx + 7 * FWD, hy + 2],
      [hx + 1 * FWD, hy + 2],
    ];
    for (const [ex, ey] of eyes) {
      if (expression === 'blink') {
        c.line(ex - 1, ey + 2, ex + 1, ey + 2, INK);
      } else if (expression === 'hit') {
        c.line(ex - 1, ey, ex + 1, ey + 2, INK);
        c.line(ex - 1, ey + 3, ex + 1, ey + 1, INK);
      } else if (expression === 'smile') {
        c.line(ex - 1, ey + 2, ex, ey + 1, INK);
        c.line(ex, ey + 1, ex + 1, ey + 2, INK);
      } else if (style === 'round') {
        c.fillRect(ex - 1, ey - 1, 3, 5, WHITE);
        c.fillRect(ex - 1, ey, 2, 4, EYE[1]!);
        c.fillRect(ex - 1, ey + 2, 2, 2, EYE[2]!);
        c.set(ex, ey, EYE[0]!);
      } else {
        c.fillRect(ex - 1, ey, 3, 3, WHITE);
        c.fillRect(ex - 1, ey, 2, 3, EYE[1]!);
        c.set(ex - 1, ey + 2, EYE[2]!);
        c.line(ex - 2, ey - 1, ex + 1, ey - 1, INK);
      }
    }
    const mouthY = hy + 8;
    c.fillRect(hx - 10, hy + 6, 3, 1, hex('#eeb0a0'));
    c.fillRect(hx + 1, hy + 6, 3, 1, hex('#eeb0a0'));
    if (expression === 'hit') c.fillRect(hx + 4 * FWD - 1, mouthY - 1, 2, 2, INK);
    else if (expression === 'smile') c.line(hx + 5 * FWD, mouthY, hx + 3 * FWD, mouthY, hex('#c2544f'));
    else c.set(hx + 4 * FWD, mouthY, hex('#c2544f'));
  };
}

function drawHairFront(style: 'short' | 'long', view: 'front' | 'back', underHat: boolean): Draw {
  return (c, rig) => {
    const [x, y] = rig.head;
    if (view === 'back') {
      c.fillEllipse(x, y - 1, HEAD_R + 1, HEAD_R, HAIR[2]!);
      c.fillEllipse(x, y - 4, HEAD_R - 3, HEAD_R - 5, HAIR[1]!);
      if (style === 'long') c.fillRect(x - 6, y + 4, 12, 12, HAIR[2]!);
      return;
    }
    const top = underHat ? y - 6 : y - HEAD_R - 2;
    // 瀏海
    c.fillPolygon(
      [
        [x - (HEAD_R + 1), top + 4],
        [x + (HEAD_R + 1), top + 4],
        [x + (HEAD_R + 1), y + 1],
        [x + 6 * FWD + 3, y - 1],
        [x + 9 * FWD, y + 2],
        [x - (HEAD_R + 1), y - 2],
      ],
      HAIR[1]!,
    );
    if (!underHat) {
      c.fillPolygon([[x-13,y-6],[x-14,y-12],[x-8,y-14],[x-5,y-18],[x-2,y-15],[x+5,y-16],[x+12,y-10],[x+13,y-3]], HAIR[2]!);
      c.fillPolygon([[x-13,y-9],[x-7,y-13],[x-4,y-15],[x+2,y-13],[x-1,y-8],[x-8,y-3],[x-7,y-8]], HAIR[1]!);
      c.fillPolygon([[x-3,y-12],[x+5,y-13],[x+10,y-8],[x+6,y],[x+3,y-6],[x-2,y-2]], HAIR[1]!);
      c.line(x-9,y-11,x-5,y-13,HAIR[0]!,2);
      c.line(x+1,y-12,x+6,y-10,HAIR[0]!);
      c.line(x+9,y-5,x+11,y+3,HAIR[3]!,2);
    }
    c.line(x - (HEAD_R - 2) * FWD, y - 4, x - (HEAD_R - 1) * FWD, y + 6, HAIR[2]!, 2);
    if (style === 'long') c.line(x - (HEAD_R - 1) * FWD, y, x - (HEAD_R + 2) * FWD, y + 12, HAIR[1]!, 3);
  };
}

function drawHairBack(style: 'short' | 'long', view: 'front' | 'back'): Draw {
  return (c, rig) => {
    const [x, y] = rig.head;
    if (view === 'back') return;
    c.fillEllipse(x - 3 * FWD, y + 1, HEAD_R, HEAD_R - 1, HAIR[2]!);
    if (style === 'long') {
      c.fillPolygon(
        [
          [x - 2 * FWD, y],
          [x - (HEAD_R + 2) * FWD, y],
          [x - (HEAD_R + 4) * FWD, y + 22],
          [x - 4 * FWD, y + 20],
        ],
        HAIR[2]!,
      );
      c.line(x - 8 * FWD, y + 4, x - 10 * FWD, y + 18, HAIR[3]!, 2);
    }
  };
}

function drawHat(style: 'cap' | 'wizard', view: 'front' | 'back'): Draw {
  return (c, rig) => {
    const [x, y] = rig.head;
    if (style === 'cap') {
      c.fillEllipse(x, y - 6, HEAD_R + 1, 8, DYE[1]!);
      c.fillRect(x - HEAD_R - 1, y - 6, (HEAD_R + 1) * 2 + 1, 3, DYE[2]!);
      c.fillEllipse(x + 2 * FWD, y - 10, 5, 2, DYE[0]!);
      if (view === 'front') c.fillRect(x + (view === 'front' ? 6 : 0) * FWD - (FWD < 0 ? 10 : 0), y - 5, 10, 3, DYE[2]!);
    } else {
      c.fillPolygon(
        [
          [x - HEAD_R - 3, y - 4],
          [x + HEAD_R + 3, y - 4],
          [x - 6 * FWD, y - 30],
        ],
        DYE[1]!,
      );
      c.fillRect(x - HEAD_R - 4, y - 6, (HEAD_R + 4) * 2 + 1, 3, DYE[2]!);
      c.fillEllipse(x - 5 * FWD, y - 20, 2, 2, hex('#ffe066'));
    }
  };
}

const drawGlasses: Draw = (c, rig) => {
  const [hx, hy] = rig.head;
  const rim = hex('#3d3550');
  c.fillRect(hx + 7 * FWD - 2, hy + 1, 5, 4, hex('#bfe7ff', 160));
  c.fillRect(hx + 1 * FWD - 2, hy + 1, 5, 4, hex('#bfe7ff', 160));
  c.line(hx + 7 * FWD - 2, hy + 1, hx + 1 * FWD + 2, hy + 1, rim);
};

function drawTop(style: 'shirt' | 'armor'): Draw {
  return (c, rig) => {
    const main = style === 'shirt' ? DYE : [hex('#d6dde8'), hex('#9aa7bb'), hex('#66738a'), hex('#3a4254')];
    c.line(...rig.backShoulder, armEnd(rig.backShoulder, 0, 0)[0], rig.backShoulder[1] + 5, main[2]!, 4);
    c.fillPolygon(torsoPolygon(rig, 1), main[1]!);
    c.line(rig.hip[0] - 4 * FWD, rig.hip[1], rig.shoulder[0] - 4 * FWD, rig.shoulder[1], main[2]!, 2);
    c.line(rig.hip[0] + 4 * FWD, rig.hip[1] - 2, rig.shoulder[0] + 3 * FWD, rig.shoulder[1] + 1, main[0]!, 1);
    c.fillRect(rig.hip[0] - 6, rig.hip[1] - 1, 13, 2, main[2]!);
    const [sx, sy] = rig.shoulder;
    // 交領、皮革斜背帶、黃銅扣與分片衣襬。
    c.fillPolygon([[sx-5,sy],[sx,sy+5],[sx+4,sy],[sx+2,sy+7],[sx-2,sy+7]], hex('#e9dfb9'));
    c.line(sx+4,sy+3,rig.hip[0]-3,rig.hip[1]-2,hex('#725744'),2);
    c.fillRect(rig.hip[0]-6,rig.hip[1]-2,13,2,hex('#493e36'));
    c.fillRect(rig.hip[0]-2,rig.hip[1]-3,3,3,hex('#d8b975'));
    c.set(rig.hip[0]-1,rig.hip[1]-2,hex('#73563a'));
    c.fillRect(rig.hip[0]+4,rig.hip[1]-4,4,5,hex('#8c6b49'));
    c.line(sx-5,sy+2,sx-6,sy+5,hex('#ead7a4'),2);
    if (style === 'armor') c.fillRect(rig.shoulder[0] - 4, rig.shoulder[1] + 3, 9, 3, hex('#e8c25a'));
  };
}

function drawSleeve(style: 'shirt' | 'armor'): Draw {
  return (c, rig) => {
    const color = style === 'shirt' ? DYE[1]! : hex('#9aa7bb');
    const elbow = armEnd(rig.frontShoulder, POSES[0] ? 0 : 0, 0);
    void elbow;
    const mid: [number, number] = [
      Math.round((rig.frontShoulder[0] * 3 + rig.frontHand[0] * 2) / 5),
      Math.round((rig.frontShoulder[1] * 3 + rig.frontHand[1] * 2) / 5),
    ];
    c.line(...rig.frontShoulder, ...mid, color, 5);
    c.line(rig.frontShoulder[0]-2,rig.frontShoulder[1],mid[0]-2,mid[1],DYE[0]!);
    c.fillRect(mid[0]-2,mid[1],4,2,hex('#d8c698'));
  };
}

function drawBottom(style: 'pants' | 'shorts'): Draw {
  return (c, rig) => {
    c.fillRect(rig.hip[0] - 6, rig.hip[1] - 2, 13, 4, DYE[1]!);
    const legs: [[number, number], [number, number], [number, number], RGBA][] = [
      [rig.backHip, rig.backKnee, rig.backFoot, DYE[2]!],
      [rig.frontHip, rig.frontKnee, rig.frontFoot, DYE[1]!],
    ];
    for (const [hip, kneePos, foot, color] of legs) {
      c.line(...hip, ...kneePos, color, 5);
      if (style === 'pants') c.line(...kneePos, foot[0], foot[1] - 2, color, 5);
    }
  };
}

const drawShoes: Draw = (c, rig) => {
  for (const [foot, color] of [
    [rig.backFoot, shade(hex('#6b4a3a'), 0.85)],
    [rig.frontFoot, hex('#6b4a3a')],
  ] as const) {
    c.fillRect(foot[0]-3,foot[1]-6,5,6,color);
    c.fillRect(foot[0]-5,foot[1]-2,8,3,color);
    c.line(foot[0]-4,foot[1],foot[0]+2,foot[1],hex('#302d2c'));
    c.line(foot[0]-3,foot[1]-5,foot[0]+1,foot[1]-5,hex('#c1a16c'));
    c.set(foot[0]-1,foot[1]-3,hex('#edcc8f'));
  }
};

const drawGlove: Draw = (c, rig) => {
  c.fillEllipse(rig.frontHand[0], rig.frontHand[1], 3, 3, DYE[1]!);
};

const drawCape: Draw = (c, rig, pose) => {
  const flow = Math.max(0, Math.min(10, pose.lean * 2 + (pose.front.dx - pose.back.dx) / 2));
  c.fillPolygon(
    [
      [rig.shoulder[0] + 3 * FWD, rig.shoulder[1]],
      [rig.shoulder[0] - 6 * FWD, rig.shoulder[1]],
      [rig.hip[0] - (9 + flow) * FWD, FOOT_Y - 4],
      [rig.hip[0] - 1 * FWD, FOOT_Y - 6],
    ],
    DYE[1]!,
  );
  c.line(rig.shoulder[0] - 5 * FWD, rig.shoulder[1] + 2, rig.hip[0] - (8 + flow) * FWD, FOOT_Y - 6, DYE[2]!, 2);
  c.line(rig.hip[0]-(9+flow)*FWD,FOOT_Y-4,rig.hip[0]-FWD,FOOT_Y-6,hex('#d6bb77'));
};

const STEEL = [hex('#f4f7fb'), hex('#c9d2df'), hex('#8e9bb0')];

function drawWeapon(kind: ClassId): Draw {
  return (c, rig, pose) => {
    const [hx, hy] = rig.frontHand;
    if (kind === 'warrior') {
      const tip = armEnd([hx, hy], pose.weapon, 22);
      const guardA = armEnd([hx, hy], pose.weapon + 90, 3);
      const guardB = armEnd([hx, hy], pose.weapon - 90, 3);
      c.line(hx, hy, ...tip, STEEL[1]!, 3);
      c.line(hx, hy, ...tip, STEEL[0]!, 1);
      c.line(...guardA, ...guardB, hex('#b8862f'), 2);
      c.fillEllipse(hx,hy,2,2,hex('#70d5ce'));
      c.line(...armEnd([hx, hy], pose.weapon + 180, 3), hx, hy, hex('#5b3a22'), 2);
    } else if (kind === 'mage') {
      const top = armEnd([hx, hy], pose.weapon, 16);
      const bottom = armEnd([hx, hy], pose.weapon + 180, 12);
      c.line(...bottom, ...top, hex('#7a5232'), 2);
      c.fillEllipse(top[0], top[1], 3, 3, hex('#b06cff'));
      c.fillPolygon([[top[0],top[1]-7],[top[0]+4,top[1]-2],[top[0],top[1]+3],[top[0]-4,top[1]-2]],hex('#79c9da'));
      c.line(top[0],top[1]-6,top[0]-2,top[1]-1,hex('#e5ffff'));
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

const VIEW_FRONT = TIMELINE.find((t) => t.name === 'stand')!.from;
const VIEW_BACK = TIMELINE.find((t) => t.name === 'ladder')!.from;

const ALL_FRAMES = Array.from({ length: FRAME_COUNT }, (_, f) => f);

/** 每個 Tag 的建議姿勢幀（時間軸幀號）。 */
function poseFrames(tags: readonly AvatarTag[]): number[] {
  return TIMELINE.filter((t) => tags.includes(t.name)).flatMap((t) => suggestedPoseFrames(t.name).map((i) => t.from + i));
}

function framesOf(tags: readonly AvatarTag[]): number[] {
  return TIMELINE.filter((t) => tags.includes(t.name)).flatMap((t) => Array.from({ length: t.to - t.from + 1 }, (_, i) => t.from + i));
}

interface LayerSpec {
  layer: string;
  frames: number[];
  draw: Draw;
  outline?: RGBA;
}

function buildSheet(layers: LayerSpec[], withSlices: boolean): SheetSpec {
  const frames: SheetFrame[] = [];
  for (const spec of layers) {
    for (const f of spec.frames) {
      frames.push({ layer: spec.layer, index: f, canvas: layerCanvas(spec.draw, RIGS[f]!, POSES[f]!, spec.outline), durationMs: DURATION[tagAt(f).tag.name] });
    }
  }
  const slices = withSlices
    ? [
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
      ]
    : [];
  return {
    frames,
    tags: TIMELINE.map((t) => ({ name: t.name, from: t.from, to: t.to })),
    slices,
    layers: layers.map((l) => l.layer),
  };
}

const COMMON: AvatarTag[] = ['stand', 'run', 'jump', 'fall', 'land', 'roll', 'prone'];
const CLASS_TAGS: Record<ClassId, AvatarTag[]> = {
  warrior: ['swing1', 'swing2', 'swing3'],
  mage: ['cast'],
  archer: ['shoot'],
  assassin: ['throw'],
};
const CLOTH_TAGS = AVATAR_TAG_NAMES;

interface ItemDef {
  item: Omit<AvatarItem, 'schemaVersion' | 'sheet' | 'icon'>;
  layers: LayerSpec[];
}

function viewLayers(layer: string, draw: (view: 'front' | 'back') => Draw, outline: RGBA, backToo = true): LayerSpec[] {
  const specs: LayerSpec[] = [{ layer, frames: [VIEW_FRONT], draw: draw('front'), outline }];
  if (backToo) specs.push({ layer, frames: [VIEW_BACK], draw: draw('back'), outline });
  return mergeSameLayer(specs);
}

/** 同一圖層的多組幀合成一個 LayerSpec（每幀用各自的 draw）。 */
function mergeSameLayer(specs: LayerSpec[]): LayerSpec[] {
  return specs;
}

const ITEMS: ItemDef[] = [
  {
    item: { id: 'face_0001', name: '圓眼', category: 'face', kind: 'anchor', layers: ['face'], recolor: 'eye' },
    layers: (['default', 'blink', 'hit', 'smile'] as Expression[]).map((expression) => ({
      layer: expression === 'default' ? 'face' : variantLayer('face', expression),
      frames: [VIEW_FRONT],
      draw: drawFace('round', expression),
    })),
  },
  {
    item: { id: 'face_0002', name: '銳眼', category: 'face', kind: 'anchor', layers: ['face'], recolor: 'eye' },
    layers: (['default', 'blink', 'hit', 'smile'] as Expression[]).map((expression) => ({
      layer: expression === 'default' ? 'face' : variantLayer('face', expression),
      frames: [VIEW_FRONT],
      draw: drawFace('sharp', expression),
    })),
  },
  ...(['short', 'long'] as const).map((style, n) => ({
    item: {
      id: `hair_000${n + 1}`,
      name: style === 'short' ? '短髮' : '馬尾',
      category: 'hair' as const,
      kind: 'anchor' as const,
      layers: ['hair_front', 'hair_back'] as AvatarItem['layers'],
      recolor: 'hair' as const,
    },
    layers: [
      ...viewLayers('hair_front', (view) => drawHairFront(style, view, false), HAIR[4]!),
      ...viewLayers(variantLayer('hair_front', 'underHat'), (view) => drawHairFront(style, view, true), HAIR[4]!),
      ...viewLayers('hair_back', (view) => drawHairBack(style, view), HAIR[4]!, false),
      ...viewLayers(variantLayer('hair_back', 'underHat'), (view) => drawHairBack(style, view), HAIR[4]!, false),
    ],
  })),
  {
    item: { id: 'hat_0001', name: '棒球帽', category: 'hat', kind: 'anchor', layers: ['hat'], recolor: 'dye', hairMode: 'underHat' },
    layers: viewLayers('hat', (view) => drawHat('cap', view), DYE[3]!),
  },
  {
    item: { id: 'hat_0002', name: '巫師帽', category: 'hat', kind: 'anchor', layers: ['hat'], recolor: 'dye', hairMode: 'underHat' },
    layers: viewLayers('hat', (view) => drawHat('wizard', view), DYE[3]!),
  },
  {
    item: { id: 'eyeAcc_0001', name: '圓框眼鏡', category: 'eyeAcc', kind: 'anchor', layers: ['eye_acc'] },
    layers: [{ layer: 'eye_acc', frames: [VIEW_FRONT], draw: drawGlasses }],
  },
  ...(['shirt', 'armor'] as const).map((style, n) => ({
    item: {
      id: `top_000${n + 1}`,
      name: style === 'shirt' ? '布衣' : '鐵甲',
      category: 'top' as const,
      kind: 'pose' as const,
      layers: ['top', 'sleeve'] as AvatarItem['layers'],
      ...(style === 'shirt' ? { recolor: 'dye' as const } : {}),
    },
    layers: [
      { layer: 'top', frames: poseFrames(CLOTH_TAGS), draw: drawTop(style), outline: style === 'shirt' ? DYE[3]! : hex('#3a4254') },
      { layer: 'sleeve', frames: poseFrames(CLOTH_TAGS), draw: drawSleeve(style), outline: style === 'shirt' ? DYE[3]! : hex('#3a4254') },
    ],
  })),
  ...(['pants', 'shorts'] as const).map((style, n) => ({
    item: {
      id: `bottom_000${n + 1}`,
      name: style === 'pants' ? '長褲' : '短褲',
      category: 'bottom' as const,
      kind: 'pose' as const,
      layers: ['bottom'] as AvatarItem['layers'],
      recolor: 'dye' as const,
    },
    // 跟著腳的部件每幀都畫，才對得準。
    layers: [{ layer: 'bottom', frames: ALL_FRAMES, draw: drawBottom(style), outline: DYE[3]! }],
  })),
  {
    item: { id: 'shoes_0001', name: '皮靴', category: 'shoes', kind: 'pose', layers: ['shoes'] },
    layers: [{ layer: 'shoes', frames: ALL_FRAMES, draw: drawShoes, outline: hex('#3b2a22') }],
  },
  {
    item: { id: 'gloves_0001', name: '布手套', category: 'gloves', kind: 'pose', layers: ['glove'], recolor: 'dye' },
    layers: [{ layer: 'glove', frames: poseFrames(CLOTH_TAGS), draw: drawGlove, outline: DYE[3]! }],
  },
  {
    item: { id: 'cape_0001', name: '短披風', category: 'cape', kind: 'pose', layers: ['cape'], recolor: 'dye' },
    layers: [{ layer: 'cape', frames: poseFrames(CLOTH_TAGS), draw: drawCape, outline: DYE[3]! }],
  },
  ...(['warrior', 'mage', 'archer', 'assassin'] as const).map((classId, n) => ({
    item: {
      id: `weapon_000${n + 1}`,
      name: { warrior: '鐵劍', mage: '木杖', archer: '獵弓', assassin: '拳刃' }[classId],
      category: 'weapon' as const,
      classId,
      kind: 'pose' as const,
      layers: (classId === 'archer' ? ['weapon', 'weapon_back'] : ['weapon']) as AvatarItem['layers'],
    },
    layers: [
      { layer: 'weapon', frames: poseFrames([...COMMON, ...CLASS_TAGS[classId]]), draw: drawWeapon(classId), outline: hex('#2f2a3a') },
      ...(classId === 'archer' ? [{ layer: 'weapon_back', frames: poseFrames(CLOTH_TAGS), draw: drawQuiver, outline: hex('#3b2a22') }] : []),
    ],
  })),
];

/** 部件第一個有圖的幀裁成 32×32 圖示（必要時縮一半）。 */
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
  writeSheet(
    dir,
    'base',
    buildSheet(
      [
        { layer: 'body', frames: ALL_FRAMES, draw: drawBody, outline: SKIN[3]! },
        { layer: 'arm_front', frames: ALL_FRAMES, draw: drawArmFront, outline: SKIN[3]! },
        { layer: 'head', frames: [VIEW_FRONT], draw: drawHead('front'), outline: SKIN[3]! },
        { layer: 'head', frames: [VIEW_BACK], draw: drawHead('back'), outline: SKIN[3]! },
      ],
      true,
    ),
  );

  for (const def of ITEMS) {
    const spec = buildSheet(def.layers, false);
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

  const traveler: SheetSpec = {
    tags: TIMELINE,
    frames: ALL_FRAMES.map((frame) => {
      const { tag, i } = tagAt(frame);
      const canvas = new Canvas(SIZE, SIZE);
      paintHero(canvas, tag.name, i);
      return { layer: 'top', index: frame, canvas, durationMs: DURATION[tag.name] };
    }),
  };
  writeSheet(`${dir}/items`, 'overall_0001', traveler);
  writePng(`${dir}/items/overall_0001.icon.png`, iconOf(traveler));
  const travelerItem: AvatarItem = {
    schemaVersion: 1, id: 'overall_0001', name: '森境旅人', category: 'overall', kind: 'pose', layers: ['top'],
    sheet: 'avatar/items/overall_0001.sheet.json', icon: 'avatar/items/overall_0001.icon.png',
    // 整體造型可在編輯器卸下，底下的分層紙娃娃、換色與其他裝備照常可用。
    hidesLayers: ['body', 'arm_front', 'head', 'face', 'hair_front', 'hair_back', 'hat', 'cape', 'shoes', 'sleeve', 'glove', 'face_acc', 'eye_acc'],
  };
  writeJson(`${dir}/items/overall_0001.json`, travelerItem);

  const palettes: PaletteFile = {
    schemaVersion: 1,
    keyRamps: { skin: [...KEY.skin], hair: [...KEY.hair], eye: [...KEY.eye], dye: [...KEY.dye] },
    palettes: [
      { id: 'palette_0001', group: 'skin', name: '白皙', colors: [...KEY.skin] },
      { id: 'palette_0002', group: 'skin', name: '小麥', colors: ['#f1c9a0', '#dca277', '#b97a52', '#7c4a30'] },
      { id: 'palette_0003', group: 'skin', name: '古銅', colors: ['#c98e63', '#a8704a', '#82502f', '#4f2e1a'] },
      { id: 'palette_0004', group: 'skin', name: '蒼白', colors: ['#fff2ea', '#f3dcd2', '#d3b2a8', '#8c6d66'] },
      { id: 'palette_0010', group: 'hair', name: '金髮', colors: [...KEY.hair] },
      { id: 'palette_0011', group: 'hair', name: '黑髮', colors: ['#6d7593', '#3b4058', '#2a2d40', '#1b1d2b', '#0e0f17'] },
      { id: 'palette_0012', group: 'hair', name: '紅髮', colors: ['#ffb39a', '#f0624a', '#c73c2f', '#8e2522', '#541414'] },
      { id: 'palette_0013', group: 'hair', name: '藍髮', colors: ['#c4f1ff', '#5cc3f5', '#2f86c9', '#1f568f', '#122f54'] },
      { id: 'palette_0014', group: 'hair', name: '粉髮', colors: ['#ffe0f0', '#ff9cc9', '#e2659f', '#a83f72', '#5e1f40'] },
      { id: 'palette_0015', group: 'hair', name: '銀髮', colors: ['#ffffff', '#dfe3ee', '#aeb4c6', '#7b8197', '#474b5c'] },
      { id: 'palette_0020', group: 'eye', name: '藍瞳', colors: [...KEY.eye] },
      { id: 'palette_0021', group: 'eye', name: '綠瞳', colors: ['#c8ffb8', '#3fb35a', '#1c5a2c'] },
      { id: 'palette_0022', group: 'eye', name: '紅瞳', colors: ['#ffc2c2', '#d8384a', '#6b1424'] },
      { id: 'palette_0023', group: 'eye', name: '金瞳', colors: ['#fff4c2', '#e2a72c', '#7a4a10'] },
      { id: 'palette_0030', group: 'dye', name: '灰藍', colors: [...KEY.dye] },
      { id: 'palette_0031', group: 'dye', name: '酒紅', colors: ['#ffc7cf', '#d1495b', '#8f2238', '#4f1020'] },
      { id: 'palette_0032', group: 'dye', name: '森綠', colors: ['#d7f5b8', '#6fbf4a', '#3d7f2a', '#1f4317'] },
      { id: 'palette_0033', group: 'dye', name: '皇家紫', colors: ['#e9d6ff', '#9a64e0', '#6337a3', '#331a59'] },
      { id: 'palette_0034', group: 'dye', name: '琥珀', colors: ['#fff0c2', '#f2b33d', '#b87516', '#6b3f08'] },
      { id: 'palette_0035', group: 'dye', name: '墨黑', colors: ['#8a8fa3', '#4a4e60', '#2b2e3b', '#15161d'] },
    ],
  };
  writeJson(`${dir}/palettes.json`, palettes);

  return { itemIds: [...ITEMS.map((def) => def.item.id), travelerItem.id] };
}
