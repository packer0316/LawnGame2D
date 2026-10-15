import { PHYSICS } from './constants';
import type { FootholdWorld } from './world';

/** 角色（玩家或怪物）的物理狀態；位置是腳底中心。 */
export interface BodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 站在哪個足場上；null = 空中或攀爬中 */
  ground: number | null;
  /** 抓著哪條繩梯 */
  climb: number | null;
  /** 1 = 面向右、-1 = 面向左 */
  facing: 1 | -1;
  coyoteMs: number;
  jumpBufferMs: number;
  dropMs: number;
  dropFh: number | null;
  airJumps: number;
}

export interface BodyInput {
  x: -1 | 0 | 1;
  up: boolean;
  down: boolean;
  /** 這一步剛按下跳躍 */
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export interface BodyOptions {
  /** 強制水平速度（翻滾、突進），會忽略左右輸入。 */
  forcedVx?: number;
  /** 站定不動（攻擊中）。跳躍輸入一併忽略。 */
  rooted?: boolean;
  /** 空中可以再跳幾次（刺客二段跳 = 1）。 */
  maxAirJumps?: number;
  canClimb?: boolean;
}

export interface StepEvents {
  jumped: boolean;
  airJumped: boolean;
  dropped: boolean;
  landed: boolean;
  leftGround: boolean;
  grabbed: boolean;
  released: boolean;
  fellOut: boolean;
}

export const NO_INPUT: BodyInput = { x: 0, up: false, down: false, jumpPressed: false, jumpHeld: false };

export function createBody(world: FootholdWorld, x: number, y: number, facing: 1 | -1 = 1): BodyState {
  const body: BodyState = { x, y, vx: 0, vy: 0, ground: null, climb: null, facing, coyoteMs: 0, jumpBufferMs: 0, dropMs: 0, dropFh: null, airJumps: 0 };
  const ground = world.groundBelow(x, y - 8);
  if (ground) {
    body.y = ground.y;
    body.ground = ground.fh;
  }
  return body;
}

const approach = (value: number, target: number, delta: number) =>
  value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

/** 前進一個固定步長（PHYSICS.dt）。 */
export function stepBody(world: FootholdWorld, body: BodyState, input: BodyInput, options: BodyOptions = {}): StepEvents {
  const events: StepEvents = { jumped: false, airJumped: false, dropped: false, landed: false, leftGround: false, grabbed: false, released: false, fellOut: false };
  const dtMs = PHYSICS.dt * 1000;
  body.jumpBufferMs = input.jumpPressed && !options.rooted ? PHYSICS.jumpBufferMs : Math.max(0, body.jumpBufferMs - dtMs);
  body.dropMs = Math.max(0, body.dropMs - dtMs);
  if (body.dropMs === 0) body.dropFh = null;

  if (body.climb !== null) {
    stepClimb(world, body, input, events);
    return events;
  }
  if ((options.canClimb ?? true) && options.forcedVx === undefined && !options.rooted && tryGrab(world, body, input)) {
    events.grabbed = true;
    return events;
  }
  if (body.ground !== null) stepGround(world, body, input, options, events);
  if (body.ground === null && body.climb === null) stepAir(world, body, input, options, events);
  if (body.y > world.height + 64) events.fellOut = true;
  return events;
}

function tryGrab(world: FootholdWorld, body: BodyState, input: BodyInput): boolean {
  let target = null;
  if (input.up) {
    const c = world.climbableAt(body.x, body.y, PHYSICS.climbGrab);
    if (c && body.y > c.yTop + 2) target = c;
  } else if (input.down && body.ground !== null) {
    // 站在繩梯頂端的平台上往下爬
    const c = world.climbableAt(body.x, body.y, PHYSICS.climbGrab, 24);
    if (c && c.yTop >= body.y - 2 && world.isOneWay(body.ground)) target = c;
  }
  if (!target) return false;
  body.climb = target.id;
  body.x = target.x;
  body.vx = 0;
  body.vy = 0;
  body.ground = null;
  body.airJumps = 0;
  return true;
}

function stepGround(world: FootholdWorld, body: BodyState, input: BodyInput, options: BodyOptions, events: StepEvents): void {
  const fh = body.ground!;
  if (options.forcedVx !== undefined) {
    body.vx = options.forcedVx;
  } else {
    const target = options.rooted ? 0 : input.x * PHYSICS.runSpeed;
    const accel = target === 0 ? PHYSICS.groundFriction : PHYSICS.groundAccel;
    body.vx = approach(body.vx, target, accel * PHYSICS.dt);
    if (input.x !== 0 && !options.rooted) body.facing = input.x;
  }
  body.airJumps = 0;

  if (body.jumpBufferMs > 0 && !options.rooted) {
    body.jumpBufferMs = 0;
    if (input.down && world.isOneWay(fh)) {
      body.dropFh = fh;
      body.dropMs = PHYSICS.dropThroughMs;
      body.ground = null;
      body.vy = 40;
      events.dropped = true;
      events.leftGround = true;
      return;
    }
    if (!input.down) {
      body.vy = -PHYSICS.jumpSpeed;
      body.ground = null;
      body.coyoteMs = 0;
      events.jumped = true;
      events.leftGround = true;
      return;
    }
  }

  const toX = body.x + body.vx * PHYSICS.dt;
  const newX = world.blockByWalls(body.x, toX, body.y - PHYSICS.height, body.y - 2, PHYSICS.halfWidth);
  if (newX !== toX) body.vx = 0;
  const y = world.footholdY(fh, newX);
  if (y !== null) {
    body.x = newX;
    body.y = y;
    return;
  }
  // 走出足場：先找相接的足場（高低差在容許範圍內），找不到就掉下去。
  const next = world.groundBelow(newX, body.y - PHYSICS.stepTolerance);
  body.x = newX;
  if (next && next.fh !== fh && Math.abs(next.y - body.y) <= PHYSICS.stepTolerance) {
    body.ground = next.fh;
    body.y = next.y;
    return;
  }
  body.ground = null;
  body.vy = 0;
  body.coyoteMs = PHYSICS.coyoteMs;
  events.leftGround = true;
}

function stepAir(world: FootholdWorld, body: BodyState, input: BodyInput, options: BodyOptions, events: StepEvents): void {
  body.coyoteMs = Math.max(0, body.coyoteMs - PHYSICS.dt * 1000);
  if (body.jumpBufferMs > 0 && !options.rooted) {
    if (body.coyoteMs > 0) {
      body.vy = -PHYSICS.jumpSpeed;
      body.coyoteMs = 0;
      body.jumpBufferMs = 0;
      events.jumped = true;
    } else if (input.jumpPressed && body.airJumps < (options.maxAirJumps ?? 0)) {
      body.vy = -PHYSICS.jumpSpeed * 0.9;
      body.airJumps += 1;
      body.jumpBufferMs = 0;
      events.airJumped = true;
    }
  }
  if (!input.jumpHeld && body.vy < -PHYSICS.jumpSpeed * PHYSICS.jumpCut) body.vy = -PHYSICS.jumpSpeed * PHYSICS.jumpCut;

  if (options.forcedVx !== undefined) {
    body.vx = options.forcedVx;
  } else {
    const target = options.rooted ? 0 : input.x * PHYSICS.airMaxSpeed;
    body.vx = approach(body.vx, target, PHYSICS.airAccel * PHYSICS.dt);
    if (input.x !== 0 && !options.rooted) body.facing = input.x;
  }
  body.vy = Math.min(PHYSICS.maxFall, body.vy + PHYSICS.gravity * PHYSICS.dt);

  const toX = body.x + body.vx * PHYSICS.dt;
  body.x = world.blockByWalls(body.x, toX, body.y - PHYSICS.height, body.y - 1, PHYSICS.halfWidth);
  if (body.x !== toX) body.vx = 0;

  let newY = body.y + body.vy * PHYSICS.dt;
  if (body.vy < 0) {
    const hit = world.ceilingHit(body.x, PHYSICS.halfWidth, body.y - PHYSICS.height, newY - PHYSICS.height);
    if (hit !== null) {
      newY = hit + PHYSICS.height;
      body.vy = 0;
    }
    body.y = newY;
    return;
  }
  const landing = world.findLanding(body.x, body.y, newY, body.dropMs > 0 ? body.dropFh : null);
  if (landing) {
    body.y = landing.y;
    body.ground = landing.fh;
    body.vy = 0;
    body.airJumps = 0;
    body.coyoteMs = 0;
    events.landed = true;
    return;
  }
  body.y = newY;
}

function stepClimb(world: FootholdWorld, body: BodyState, input: BodyInput, events: StepEvents): void {
  const climb = world.climbables.find((c) => c.id === body.climb);
  if (!climb) {
    body.climb = null;
    return;
  }
  if (body.jumpBufferMs > 0 && input.x !== 0) {
    body.climb = null;
    body.jumpBufferMs = 0;
    body.vx = input.x * PHYSICS.climbJumpSideSpeed;
    body.vy = -PHYSICS.climbJumpSpeed;
    body.facing = input.x;
    events.released = true;
    events.jumped = true;
    return;
  }
  body.x = climb.x;
  body.vx = 0;
  body.vy = input.up ? -PHYSICS.climbSpeed : input.down ? PHYSICS.climbSpeed : 0;
  body.y += body.vy * PHYSICS.dt;

  if (body.vy < 0 && body.y <= climb.yTop) {
    // 爬到頂：上方有足場就站上去，沒有就停在繩頭。
    const top = world.groundBelow(body.x, climb.yTop - 24);
    if (top && top.y <= climb.yTop + 2) {
      body.climb = null;
      body.ground = top.fh;
      body.y = top.y;
      body.vy = 0;
      events.released = true;
    } else {
      body.y = climb.yTop;
    }
    return;
  }
  if (body.vy > 0 && body.y >= climb.yBottom) {
    body.climb = null;
    const floor = world.groundBelow(body.x, climb.yBottom - 2);
    if (floor && floor.y <= climb.yBottom + 4) {
      body.ground = floor.fh;
      body.y = floor.y;
      events.landed = true;
    }
    body.vy = 0;
    events.released = true;
  }
}
