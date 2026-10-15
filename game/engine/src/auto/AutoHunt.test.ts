import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FootholdWorld, buildNavGraph, type ClassDef, type MapDef, type Rect, type SkillDef } from '@lawn/shared';
import { Player } from '../actor/Player';
import type { AvatarView } from '../avatar/AvatarView';
import type { MonsterActor } from '../monster/MonsterActor';
import { AUTO_ROOM, AutoHunt } from './AutoHunt';

/**
 *  y=240  ════ fh5（60–160）       ════════ fh3（500–700）
 *  y=330     ║ 懸空繩 x=110  ═══ fh2（200–360）    ║ 繩 x=600
 *  y=400 ───────────────────────────────────────────────── fh1 地面（0–800）
 */
const map = {
  size: { w: 800, h: 480 },
  footholds: [
    { id: 1, points: [[0, 400], [800, 400]], oneWay: false },
    { id: 2, points: [[200, 330], [360, 330]], oneWay: true },
    { id: 3, points: [[500, 240], [700, 240]], oneWay: true },
    { id: 5, points: [[60, 240], [160, 240]], oneWay: true },
  ],
  walls: [],
  ceilings: [],
  climbables: [
    { id: 1, type: 'rope', x: 600, yTop: 240, yBottom: 400 },
    { id: 2, type: 'rope', x: 110, yTop: 240, yBottom: 330 },
  ],
  portals: [{ id: 'next', type: 'next', x: 780, y: 400 }],
} as unknown as MapDef;

const world = new FootholdWorld(map);
const nav = buildNavGraph(map);
const contentDir = new URL('../../../../content/class/', import.meta.url);
const classes = (JSON.parse(readFileSync(new URL('classes.json', contentDir), 'utf8')) as { classes: ClassDef[] }).classes;
const skills = new Map((JSON.parse(readFileSync(new URL('skills.json', contentDir), 'utf8')) as { skills: SkillDef[] }).skills.map((s) => [s.id, s]));
const warrior = classes.find((c) => c.id === 'warrior')!;

const avatar = { play() {}, setFacing() {}, playMotion: () => false, stopMotion() {}, animator: { speed: 1 } } as unknown as AvatarView;

interface Fake {
  alive: boolean;
  x: number;
  y: number;
}

function monster(uid: number, x: number, y: number, fh: number | null): MonsterActor & Fake {
  const m = {
    alive: true,
    spawn: { uid, multiplier: 2 },
    math: { tier: 'normal' },
    x,
    y,
    flying: fh === null,
    foothold: fh,
    hitbox: (): Rect => ({ x: m.x - 12, y: m.y - 30, w: 24, h: 30 }),
  };
  return m as unknown as MonsterActor & Fake;
}

/** 跑到目標被打中或時間到；回傳用了幾步（-1 = 沒打到）。 */
function hunt(targets: (MonsterActor & Fake)[], start: { x: number; y: number }, maxSteps = 60 * 25) {
  const auto = new AutoHunt();
  auto.config.useSkills = false;
  let player!: Player;
  const hits: number[] = [];
  player = new Player(world, start.x, start.y, warrior, skills, { pose: () => 300, motion: () => 0 }, avatar, {
    onStrike(skill) {
      // 跟 GameScene.findTargets 一樣用矩形判定
      const area = skill.strikes[0]!.area;
      const body = player.body;
      const near = body.x + body.facing * (area.offsetX ?? 0);
      const far = near + body.facing * (area.w ?? 0);
      const h = area.h ?? 24;
      const zone = { x: Math.min(near, far), y: body.y - 24 - h / 2, w: Math.abs(far - near), h };
      for (const m of targets) {
        const b = m.hitbox();
        if (m.alive && b.x < zone.x + zone.w && b.x + b.w > zone.x && b.y < zone.y + zone.h && b.y + b.h > zone.y) {
          m.alive = false;
          hits.push(m.spawn.uid);
        }
      }
    },
  });
  for (let i = 0; i < maxSteps; i += 1) {
    const input = auto.step({ world, nav, map, player, monsters: targets, basic: skills.get(warrior.basic)!, skills: [] });
    player.step(world, input);
    if (targets.every((m) => !m.alive)) return { steps: i, hits, player };
  }
  return { steps: -1, hits, player };
}

describe('自動掛機', () => {
  it('同一個足場：走過去砍', () => {
    const result = hunt([monster(1, 300, 400, 1)], { x: 700, y: 400 });
    expect(result.steps).toBeGreaterThan(0);
  });

  it('跳上單向平台', () => {
    const result = hunt([monster(1, 280, 330, 2)], { x: 700, y: 400 });
    expect(result.steps).toBeGreaterThan(0);
    expect(result.player.body.ground).toBe(2);
  });

  it('爬繩子上高台', () => {
    const result = hunt([monster(1, 660, 240, 3)], { x: 100, y: 400 });
    expect(result.steps).toBeGreaterThan(0);
    expect(result.player.body.ground).toBe(3);
  });

  it('跳起來抓懸空的繩子', () => {
    const result = hunt([monster(1, 80, 240, 5)], { x: 700, y: 400 });
    expect(result.steps).toBeGreaterThan(0);
    expect(result.player.body.ground).toBe(5);
  });

  it('從高台下來打地面的怪', () => {
    const result = hunt([monster(1, 400, 400, 1)], { x: 620, y: 240 });
    expect(result.steps).toBeGreaterThan(0);
    expect(result.player.body.ground).toBe(1);
  });

  it('跳起來打低空飛行的怪', () => {
    const result = hunt([monster(1, 450, 320, null)], { x: 700, y: 400 });
    expect(result.steps).toBeGreaterThan(0);
  });

  it('依序清完多隻', () => {
    const targets = [monster(1, 300, 400, 1), monster(2, 280, 330, 2), monster(3, 660, 240, 3)];
    const result = hunt(targets, { x: 50, y: 400 }, 60 * 60);
    expect(result.steps).toBeGreaterThan(0);
    expect(result.hits.sort()).toEqual([1, 2, 3]);
  });

  it('怪太少時走去下一房傳送點按 ↑', () => {
    const auto = new AutoHunt();
    auto.config.autoRoom = true;
    const player = new Player(world, 620, 240, warrior, skills, { pose: () => 300, motion: () => 0 }, avatar, { onStrike() {} });
    let pressedUpAt = -1;
    for (let i = 0; i < 60 * 20 && pressedUpAt < 0; i += 1) {
      const input = auto.step({ world, nav, map, player, monsters: [], basic: skills.get(warrior.basic)!, skills: [] });
      player.step(world, input);
      if (input.up && auto.status === 'portal' && player.body.ground !== null) pressedUpAt = i;
    }
    expect(pressedUpAt).toBeGreaterThan((AUTO_ROOM.afterMs / 1000) * 60 - 1);
    expect(Math.abs(player.body.x - 780)).toBeLessThanOrEqual(16);
    expect(player.body.ground).toBe(1);
  });

  it('走下跳的邊卻掛在繩上：朝目標足場爬下來，不會乾等到逾時', () => {
    const auto = new AutoHunt();
    const player = new Player(world, 600, 240, warrior, skills, { pose: () => 300, motion: () => 0 }, avatar, { onStrike() {} });
    // 從高台 fh3 下跳到地面途中，抓住了 x=600 的繩子（240–400）
    Object.assign(player.body, { x: 600, y: 330, ground: null, climb: 1, vx: 0, vy: 0 });
    Object.assign(auto, { run: { edge: { from: 3, to: 1, type: 'drop', x: 600, dir: 0 }, phase: 'act', ms: 0, started: true, left: false, up: false } });
    let landedAt = -1;
    for (let i = 0; i < 60 * 3 && landedAt < 0; i += 1) {
      player.step(world, auto.step({ world, nav, map, player, monsters: [], basic: skills.get(warrior.basic)!, skills: [] }));
      if (player.body.ground === 1) landedAt = i;
    }
    expect(landedAt).toBeGreaterThan(0);
    expect(landedAt).toBeLessThan(60 * 1.5);
  });

  it('打不到的怪不會卡住，改打別隻', () => {
    // 飛太高的怪（跳不到）＋地面的怪
    const targets = [monster(1, 400, 150, null), monster(2, 200, 400, 1)];
    const auto = hunt(targets, { x: 450, y: 400 }, 60 * 10);
    expect(auto.hits).toContain(2);
  });
});
