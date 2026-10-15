import { describe, expect, it } from 'vitest';
import { MAX_JUMP_HEIGHT, PHYSICS } from './constants';
import { NO_INPUT, createBody, stepBody, type BodyInput, type BodyState } from './body';
import { FootholdWorld } from './world';

/**
 *  y=100 ┌────┐ 天花板（x 0–60）
 *  y=120                                ┌──────┐ 方塊頂（x 160–200），左側是牆
 *  y=140      ═══════ 單向平台（x 40–90）
 *  y=156             ║ 梯子（x 70，156–200）
 *  y=168                       ╱────────┘
 *  y=200 ──────────────────────╯ 地面（0–100 平地、100–132 上坡）
 */
const world = new FootholdWorld({
  size: { w: 200, h: 240 },
  footholds: [
    { id: 1, points: [[0, 200], [100, 200], [132, 168], [160, 168]], oneWay: false },
    { id: 2, points: [[40, 140], [90, 140]], oneWay: true },
    { id: 3, points: [[160, 120], [200, 120]], oneWay: false },
  ],
  walls: [{ id: 1, x: 160, yTop: 120, yBottom: 168, side: 1 }],
  ceilings: [{ id: 1, y: 100, x1: 0, x2: 60 }],
  climbables: [{ id: 1, type: 'ladder', x: 70, yTop: 156, yBottom: 200 }],
});

const input = (patch: Partial<BodyInput>): BodyInput => ({ ...NO_INPUT, ...patch });

function run(body: BodyState, steps: number, patch: Partial<BodyInput> = {}): void {
  for (let i = 0; i < steps; i += 1) stepBody(world, body, input(patch));
}

describe('足場物理', () => {
  it('出生時吸附到下方地面', () => {
    const body = createBody(world, 20, 150);
    expect(body.ground).toBe(1);
    expect(body.y).toBe(200);
  });

  it('沿斜坡跑上去', () => {
    const body = createBody(world, 90, 200);
    while (body.x < 116) stepBody(world, body, input({ x: 1 }));
    expect(body.ground).toBe(1);
    expect(body.y).toBeCloseTo(200 - (body.x - 100), 5);
  });

  it('被牆擋住', () => {
    const body = createBody(world, 140, 168);
    run(body, 60, { x: 1 });
    expect(body.x).toBe(160 - PHYSICS.halfWidth);
    expect(body.vx).toBe(0);
  });

  it('跳起來撞到天花板', () => {
    const body = createBody(world, 20, 200);
    stepBody(world, body, input({ jumpPressed: true, jumpHeld: true }));
    let minY = body.y;
    for (let i = 0; i < 60; i += 1) {
      stepBody(world, body, input({ jumpHeld: true }));
      minY = Math.min(minY, body.y);
    }
    expect(minY).toBeCloseTo(100 + PHYSICS.height, 5);
    expect(body.ground).toBe(1);
  });

  it('最高跳躍高度約 104 像素', () => {
    expect(MAX_JUMP_HEIGHT).toBeCloseTo(104, 0);
  });

  it('從下方跳上單向平台', () => {
    const body = createBody(world, 80, 200);
    stepBody(world, body, input({ jumpPressed: true, jumpHeld: true }));
    run(body, 90, { jumpHeld: true });
    expect(body.ground).toBe(2);
    expect(body.y).toBe(140);
  });

  it('↓ + 跳 穿過單向平台', () => {
    const body = createBody(world, 50, 140);
    expect(body.ground).toBe(2);
    stepBody(world, body, input({ down: true, jumpPressed: true, jumpHeld: true }));
    run(body, 60);
    expect(body.ground).toBe(1);
    expect(body.y).toBe(200);
  });

  it('土狼時間：走出平台邊緣後仍可起跳', () => {
    const body = createBody(world, 86, 140);
    while (body.ground === 2) stepBody(world, body, input({ x: 1 }));
    stepBody(world, body, input({ x: 1, jumpPressed: true, jumpHeld: true }));
    expect(body.vy).toBeLessThan(-PHYSICS.jumpSpeed * 0.8);
  });

  it('沿梯子爬上平台', () => {
    const body = createBody(world, 72, 200);
    stepBody(world, body, input({ up: true }));
    expect(body.climb).toBe(1);
    expect(body.x).toBe(70);
    run(body, 60, { up: true });
    expect(body.climb).toBeNull();
    expect(body.ground).toBe(2);
    expect(body.y).toBe(140);
  });

  it('從平台往下爬梯子到地面', () => {
    const body = createBody(world, 70, 140);
    stepBody(world, body, input({ down: true }));
    expect(body.climb).toBe(1);
    run(body, 60, { down: true });
    expect(body.ground).toBe(1);
    expect(body.y).toBe(200);
  });

  it('跑出地圖右緣前停下', () => {
    const body = createBody(world, 180, 120);
    run(body, 30, { x: 1 });
    expect(body.x).toBe(200 - PHYSICS.halfWidth);
  });
});
