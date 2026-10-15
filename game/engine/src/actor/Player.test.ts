import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FootholdWorld, type ClassDef, type SkillDef } from '@lawn/shared';
import type { AvatarView } from '../avatar/AvatarView';
import { Player, type PlayerHooks, type PlayerInput } from './Player';

const world = new FootholdWorld({
  size: { w: 800, h: 480 },
  footholds: [{ id: 1, points: [[0, 400], [800, 400]], oneWay: false }],
  walls: [],
  ceilings: [],
  climbables: [],
});
const contentDir = new URL('../../../../content/class/', import.meta.url);
const classes = (JSON.parse(readFileSync(new URL('classes.json', contentDir), 'utf8')) as { classes: ClassDef[] }).classes;
const skills = new Map((JSON.parse(readFileSync(new URL('skills.json', contentDir), 'utf8')) as { skills: SkillDef[] }).skills.map((s) => [s.id, s]));
const warrior = classes.find((c) => c.id === 'warrior')!;
const avatar = { play() {}, setFacing() {}, playMotion: () => false, stopMotion() {}, animator: { speed: 1 } } as unknown as AvatarView;
const IDLE: PlayerInput = { x: 0, up: false, down: false, jumpPressed: false, jumpHeld: false, attack: false, secondary: false, skill: -1, roll: false };

function makePlayer(hooks: Partial<PlayerHooks> = {}): Player {
  return new Player(world, 100, 400, warrior, skills, { pose: () => 300, motion: () => 0 }, avatar, { onStrike() {}, ...hooks });
}

/** 跑到動作結束。 */
function settle(player: Player): void {
  for (let i = 0; i < 240 && player.attacking; i += 1) player.step(world, IDLE);
}

describe('技能列與常駐小技能', () => {
  it('開發模式（沒有 resolveSlot）：照職業技能列、有冷卻', () => {
    const player = makePlayer();
    player.step(world, { ...IDLE, skill: 0 });
    expect(player.attacking?.id).toBe(warrior.skills[0]);
    settle(player);
    player.step(world, { ...IDLE, skill: 0 });
    expect(player.attacking).toBeNull();
  });

  it('實際模式：消耗型格子放出去就通知用掉，而且不看冷卻', () => {
    const used: number[] = [];
    const player = makePlayer({
      resolveSlot: (slot) => (slot <= 1 ? { skillId: 'skill_0006', consumable: true } : null),
      onSlotUsed: (slot) => used.push(slot),
    });
    player.step(world, { ...IDLE, skill: 0 });
    expect(player.attacking?.id).toBe('skill_0006');
    settle(player);
    // 同一個技能在另一格：消耗型不受冷卻限制
    player.step(world, { ...IDLE, skill: 1 });
    expect(player.attacking?.id).toBe('skill_0006');
    expect(used).toEqual([0, 1]);
  });

  it('空的格子按了沒反應', () => {
    const player = makePlayer({ resolveSlot: () => null });
    player.step(world, { ...IDLE, skill: 3 });
    expect(player.attacking).toBeNull();
  });

  it('X 放常駐小技能', () => {
    const player = makePlayer({ resolveSlot: () => null });
    player.step(world, { ...IDLE, secondary: true });
    expect(player.attacking?.id).toBe(warrior.secondary);
  });
});
