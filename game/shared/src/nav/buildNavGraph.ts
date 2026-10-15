import type { MapDef, NavEdgeType, NavGraph } from '../content/map';
import { stepBody, type BodyInput, type BodyState } from '../physics/body';
import { MAX_JUMP_HEIGHT, PHYSICS } from '../physics/constants';
import { FootholdWorld } from '../physics/world';

/**
 * 導航圖：節點 = 足場，邊 = 實際用遊戲物理模擬得到的移動方式（SPEC §3.6、STUDIO_SPEC §6.3）。
 *
 * - run：沿相接的足場直接跑過去
 * - drop：走出平台邊緣掉下去，或在單向平台上 ↓ + 跳
 * - jump：在足場上某一點往左／原地／往右起跳（跳躍鍵按到底）
 * - climb：繩梯連接上下兩個足場
 *
 * 因為用的是同一套 stepBody，所以「導航圖說到得了」就一定到得了；物理常數改了要重新產生。
 */
export type NavGeometry = Pick<MapDef, 'footholds' | 'walls' | 'ceilings' | 'climbables' | 'size'>;

export interface NavBuildOptions {
  /** 起跳點取樣間距（像素），越小越準、越慢 */
  sampleStep?: number;
  /** 每次模擬最多幾步（60 步 = 1 秒） */
  maxSteps?: number;
}

type Edge = NavGraph['edges'][number];

export function buildNavGraph(map: NavGeometry, options: NavBuildOptions = {}): NavGraph {
  const world = new FootholdWorld(map);
  const sampleStep = options.sampleStep ?? 24;
  const maxSteps = options.maxSteps ?? 120;
  const edges = new Map<string, Edge>();
  const add = (from: number, to: number | null, type: NavEdgeType, x: number, dir: -1 | 0 | 1) => {
    if (to === null || from === to) return;
    const key = `${from}>${to}>${type}`;
    if (!edges.has(key)) edges.set(key, { from, to, type, x: Math.round(x), dir });
  };

  for (const fh of map.footholds) {
    const range = world.footholdRange(fh.id);
    if (!range) continue;
    const margin = PHYSICS.halfWidth + 1;
    const samples: number[] = [];
    for (let x = range.x1 + margin; x <= range.x2 - margin; x += sampleStep) samples.push(x);
    if (samples.at(-1) !== range.x2 - margin) samples.push(range.x2 - margin);

    for (const x of samples) {
      const y = world.footholdY(fh.id, x);
      if (y === null) continue;
      for (const dir of [-1, 0, 1] as const) {
        add(fh.id, simulateAir(world, fh.id, x, y, (i) => ({ x: dir, up: false, down: false, jumpPressed: i === 0, jumpHeld: true }), maxSteps), 'jump', x, dir);
      }
      if (fh.oneWay) {
        add(fh.id, simulateAir(world, fh.id, x, y, (i) => ({ x: 0, up: false, down: true, jumpPressed: i === 0, jumpHeld: false }), maxSteps), 'drop', x, 0);
      }
    }

    for (const [x, dir] of [
      [range.x1 + 1, -1],
      [range.x2 - 1, 1],
    ] as const) {
      const y = world.footholdY(fh.id, x);
      if (y === null) continue;
      const result = simulateWalk(world, fh.id, x, y, dir, maxSteps);
      if (result) add(fh.id, result.fh, result.viaGround ? 'run' : 'drop', x, dir);
    }
  }

  for (const c of map.climbables) {
    const bottom = world.groundBelow(c.x, c.yBottom - 2);
    const top = world.groundBelow(c.x, c.yTop - 24);
    const topOk = top && top.y <= c.yTop + 2;
    // 繩梯底端碰得到地面：直接爬；懸空的繩子：在正下方跳起來抓（跳得到才算）
    const gap = bottom ? bottom.y - c.yBottom : Infinity;
    const reachable = gap <= 4 || gap <= MAX_JUMP_HEIGHT - 12;
    if (bottom && reachable && topOk && bottom.fh !== top.fh) {
      add(bottom.fh, top.fh, 'climb', c.x, 0);
      add(top.fh, bottom.fh, 'climb', c.x, 0);
    }
  }

  return {
    nodes: map.footholds.map((fh) => ({ id: fh.id, footholdIds: [fh.id] })),
    edges: [...edges.values()],
  };
}

function bodyAt(fh: number, x: number, y: number): BodyState {
  return { x, y, vx: 0, vy: 0, ground: fh, climb: null, facing: 1, coyoteMs: 0, jumpBufferMs: 0, dropMs: 0, dropFh: null, airJumps: 0 };
}

/** 起跳或下跳後落在哪個足場。 */
function simulateAir(world: FootholdWorld, fh: number, x: number, y: number, input: (i: number) => BodyInput, maxSteps: number): number | null {
  const body = bodyAt(fh, x, y);
  let airborne = false;
  for (let i = 0; i < maxSteps; i += 1) {
    const events = stepBody(world, body, input(i), { canClimb: false });
    if (events.leftGround) airborne = true;
    if (events.fellOut) return null;
    if (airborne && events.landed) return body.ground;
    if (!airborne && i > 2) return null; // 沒起跳成功（例如被天花板頂著）
  }
  return null;
}

/** 往邊緣走：接到相接的足場（run）或掉到下面的足場（drop）。 */
function simulateWalk(world: FootholdWorld, fh: number, x: number, y: number, dir: -1 | 1, maxSteps: number): { fh: number | null; viaGround: boolean } | null {
  const body = bodyAt(fh, x, y);
  let airborne = false;
  for (let i = 0; i < maxSteps; i += 1) {
    const events = stepBody(world, body, { x: dir, up: false, down: false, jumpPressed: false, jumpHeld: false }, { canClimb: false });
    if (events.fellOut) return null;
    if (events.leftGround) airborne = true;
    if (!airborne && body.ground !== null && body.ground !== fh) return { fh: body.ground, viaGround: true };
    if (airborne && events.landed) return { fh: body.ground, viaGround: false };
    if (!airborne && i > 4 && body.vx === 0) return null; // 被牆擋住
  }
  return null;
}
