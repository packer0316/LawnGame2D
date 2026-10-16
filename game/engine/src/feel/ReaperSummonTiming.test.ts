import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SkillFileVersioned } from '@lawn/shared';
import { REAPER_SKILL, REAPER_TIMING as T, reaperPose } from './ReaperSummonTiming';
import { impactFeel } from './SkillPresentation';

const data = JSON.parse(readFileSync(new URL('../../../../content/class/skills.json', import.meta.url), 'utf8'));
const skill = SkillFileVersioned.migrate(data).skills.find(skill => skill.id === REAPER_SKILL)!;

describe('死神召喚：一刀引魂', () => {
  it('先抬頭凝視，再拉遠蓄力；所有傷害都發生在單次揮刀之後', () => {
    expect(T.pullback - T.gaze).toBeGreaterThanOrEqual(400);
    expect(T.charge).toBeGreaterThan(T.reveal);
    expect(T.cut - T.charge).toBeGreaterThanOrEqual(400);
    expect(T.souls).toBeGreaterThan(T.cutEnd);
    expect(skill.strikes.map(strike => strike.atMs)).toEqual([...T.hits]);
    expect(T.hits[0]).toBeGreaterThan(T.souls);
    expect(skill.cues?.filter(cue => cue.fx === 'reaperCut')).toEqual([{ atMs: T.cut, fx: 'reaperCut' }]);
  });

  it('六段全圖魂爆保留原有價格與冷卻，取消點在演出完成後', () => {
    expect(skill.strikes).toHaveLength(6);
    expect(skill.strikes.every(strike => strike.area.shape === 'map' && strike.maxTargets >= 1000 && strike.pierce)).toBe(true);
    expect(skill.strikes.every(strike => !strike.fx?.includes('Sweep'))).toBe(true);
    expect([skill.price, skill.fullTargets, skill.cooldownSec]).toEqual([20, 30, 30]);
    expect(skill.cancelFromMs).toBe(T.end);
  });

  it('逐步加速，最後留拍；中途短停，終結重停', () => {
    const gaps = T.hits.slice(1, 5).map((time, i) => time - T.hits[i]!);
    expect(gaps).toEqual([160, 140, 120, 100]);
    expect(T.hits[5] - T.hits[4]).toBeGreaterThan(200);
    expect(impactFeel(skill, 0).stopMs).toBe(8);
    expect(impactFeel(skill, 5).stopMs).toBe(100);
  });

  it('身體格只往前播放一次，所有魂爆期間都保持收刀姿勢', () => {
    const frames = Array.from({ length: 389 }, (_, index) => reaperPose(index * 10).body);
    expect(frames.every((frame, index) => !index || frame >= frames[index - 1]!)).toBe(true);
    expect(new Set(frames)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    for (const time of T.hits) expect(reaperPose(time).body).toBe(7);
    expect(reaperPose(T.gaze - 1).portrait).toBe(3);
    expect(reaperPose(T.gaze).portrait).toBe(4);
    expect(reaperPose(1400)).toEqual(reaperPose(1400));
  });
});
