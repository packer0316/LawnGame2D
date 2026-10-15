import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FootholdWorld, PHYSICS, createBody, type BodyState, type MapDef, type Rect } from '@lawn/shared';
import { canPatrol, patrolStep } from './patrol';

/**
 *  y=150  ═════ fh3（20–120）                       ═ fh2（300–316，太窄）
 *  y=252              ╱‾‾‾‾‾‾╲  坡頂（148–200）
 *  y=300 ────────────╯        ╲───────────────── fh1 地面（45° 上坡、下坡）
 *        ║ 牆 x=0                              ║ 牆 x=400
 */
const map = {
  size: { w: 400, h: 340 },
  footholds: [
    { id: 1, points: [[0, 300], [100, 300], [148, 252], [200, 252], [248, 300], [400, 300]], oneWay: false },
    { id: 2, points: [[300, 150], [316, 150]], oneWay: true },
    { id: 3, points: [[20, 150], [120, 150]], oneWay: true },
  ],
  walls: [
    { id: 1, x: 0, yTop: 0, yBottom: 300, side: -1 },
    { id: 2, x: 400, yTop: 0, yBottom: 300, side: 1 },
  ],
  ceilings: [],
  climbables: [],
} as unknown as MapDef;
const world = new FootholdWorld(map);
const everywhere: Rect = { x: 0, y: 0, w: 400, h: 340 };

/** 一直走 steps 步，回傳走過的範圍與翻面次數。 */
function walk(body: BodyState, facing: 1 | -1, steps: number, zone = everywhere, speed = 60, w = world) {
  let minX = body.x;
  let maxX = body.x;
  let flips = 0;
  let stuck = 0;
  for (let i = 0; i < steps; i += 1) {
    const result = patrolStep(w, body, facing, speed, zone);
    if (result.facing !== facing) flips += 1;
    if (result.stuck) stuck += 1;
    facing = result.facing;
    minX = Math.min(minX, body.x);
    maxX = Math.max(maxX, body.x);
  }
  return { minX, maxX, flips, stuck, facing };
}

describe('怪物巡邏', () => {
  it('斜坡不是邊緣：從坡頂走下去、走遍整片地面', () => {
    const body = createBody(world, 174, 240);
    expect(body.ground).toBe(1);
    const trip = walk(body, 1, 60 * 30);
    expect(trip.minX).toBeLessThan(20);
    expect(trip.maxX).toBeGreaterThan(380);
  });

  it('生在斜坡上不會原地左右翻', () => {
    const body = createBody(world, 124, 270);
    expect(body.y).toBeCloseTo(276, 5);
    const trip = walk(body, 1, 120);
    expect(trip.flips).toBe(0);
    expect(trip.maxX - 124).toBeGreaterThan(100);
  });

  it('單向平台邊緣會轉身，不會走下去', () => {
    const body = createBody(world, 70, 140);
    expect(body.ground).toBe(3);
    const trip = walk(body, 1, 60 * 10);
    expect(body.ground).toBe(3);
    expect(trip.minX).toBeLessThan(20 + PHYSICS.halfWidth + 8);
    expect(trip.maxX).toBeGreaterThan(120 - PHYSICS.halfWidth - 8);
  });

  it('被擊退到生怪區外面：只擋往外走，能走回區內', () => {
    const zone: Rect = { x: 150, y: 200, w: 200, h: 100 };
    const body = createBody(world, 120, 290);
    expect(canPatrol(world, body, -1, zone)).toBe(false);
    expect(canPatrol(world, body, 1, zone)).toBe(true);
    walk(body, -1, 60 * 2, zone);
    expect(body.x).toBeGreaterThan(150);
  });

  it('兩邊都不能走（太窄的平台）：停住並回報 stuck，不左右翻', () => {
    const body = createBody(world, 308, 140);
    expect(body.ground).toBe(2);
    const trip = walk(body, 1, 60);
    expect(trip.stuck).toBe(60);
    expect(trip.flips).toBe(0);
    expect(body.x).toBe(308);
  });

  it('前方是牆就轉身', () => {
    const body = createBody(world, 400 - PHYSICS.halfWidth - 1, 290);
    expect(canPatrol(world, body, 1, everywhere)).toBe(false);
    expect(canPatrol(world, body, -1, everywhere)).toBe(true);
  });
});

describe('正式地圖：每個生怪點都能走遍所在足場', () => {
  const dir = new URL('../../../../content/maps/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it.each(files)('%s', (file) => {
    const content = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as MapDef;
    const w = new FootholdWorld(content);
    // 轉身點：探測點（腳底前方 halfWidth + 4）碰到邊界時，再加一步的誤差
    const margin = PHYSICS.halfWidth + 4 + 3;
    for (const zone of content.spawnZones) {
      for (let i = 0; i <= 8; i += 1) {
        const x = zone.rect.x + (zone.rect.w * i) / 8;
        // 跟 LocalServer.spawnIn、MonsterActor 一樣決定出生點
        const ground = w.groundBelow(x, zone.rect.y - 4);
        if (!ground || ground.y > zone.rect.y + zone.rect.h + 32) continue;
        const body = createBody(w, x, ground.y - 2, 1);
        const range = w.footholdRange(body.ground!)!;
        const lo = Math.max(range.x1, zone.rect.x);
        const hi = Math.min(range.x2, zone.rect.x + zone.rect.w);
        if (hi - lo < margin * 2) continue;
        // 一律用較快的速度跑（2 px/步），確保時間內能來回一趟
        const trip = walk(body, 1, Math.ceil(((hi - lo) * 2.5) / 2), zone.rect, 120, w);
        const where = `${file} 生怪區 ${zone.id} x=${x.toFixed(0)}`;
        expect(trip.minX, where).toBeLessThanOrEqual(lo + margin);
        expect(trip.maxX, where).toBeGreaterThanOrEqual(hi - margin);
      }
    }
  });
});
