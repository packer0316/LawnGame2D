import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SkillFileVersioned } from '@lawn/shared';
import { SFX_SAMPLES } from './Sfx';
import { SFX_CUES, cueSamples } from './sfxCues';

const skills = SkillFileVersioned.migrate(JSON.parse(readFileSync(new URL('../../../../content/class/skills.json', import.meta.url), 'utf8'))).skills;
const has = (...names: string[]) => names.some((name) => name in SFX_CUES);

describe('音效組合表', () => {
  it('用到的素材都有檔案', () => {
    const missing = [...cueSamples()].filter((name) => !SFX_SAMPLES.has(name));
    expect(missing).toEqual([]);
  });

  it('每一層的參數合理', () => {
    for (const [name, cue] of Object.entries(SFX_CUES)) {
      for (const layer of cue) {
        expect(layer.at ?? 0, name).toBeGreaterThanOrEqual(0);
        expect(layer.gain ?? 0, name).toBeLessThanOrEqual(0);
        expect(layer.rate ?? 1, name).toBeGreaterThan(0.3);
        expect(typeof layer.s === 'string' || layer.s.length > 0, name).toBe(true);
      }
    }
  });

  it('每個技能的起手、特效、演出、射出、命中都有聲音', () => {
    for (const skill of skills) {
      const id = `${skill.id} ${skill.name}`;
      if (skill.kind !== 'basic') expect(has(`cast:${skill.id}`, `cast:${skill.classId}`), `${id} 起手`).toBe(true);
      for (const strike of skill.strikes) if (strike.fx) expect(has(`fx:${strike.fx}:${skill.classId}`, `fx:${strike.fx}`), `${id} 特效 ${strike.fx}`).toBe(true);
      for (const cue of skill.cues ?? []) expect(has(`cue:${cue.fx}`), `${id} 演出 ${cue.fx}`).toBe(true);
      if (skill.projectile) expect(has(`launch:${skill.id}`, `launch:${skill.classId}`), `${id} 射出`).toBe(true);
      expect(has(`hit:${skill.id}`, `hit:${skill.classId}`), `${id} 命中`).toBe(true);
      // 近戰普攻沒有特效聲，要有揮刀聲
      if (skill.kind === 'basic' && !skill.projectile) expect(has(`swing:${skill.id}`), `${id} 揮刀`).toBe(true);
    }
  });

  it('多段技能的層：大部分不只一層（疊加，不是單一素材）', () => {
    const skillCues = Object.entries(SFX_CUES).filter(([name]) => /^(cast|fx|cue|launch):/.test(name) && SFX_CUES[name]!.length > 0);
    const layered = skillCues.filter(([, cue]) => cue.length >= 2);
    expect(layered.length / skillCues.length).toBeGreaterThan(0.85);
  });
});
