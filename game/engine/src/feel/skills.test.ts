import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ClassFileVersioned, SkillFileVersioned, parseAsepriteSheet } from '@lawn/shared';

/** 技能資料（content/class）跟遊戲程式對得上：整體動畫 Tag、特效名稱、圖示都存在。 */
const read = (url: URL) => readFileSync(url, 'utf8');
const json = (url: URL): unknown => JSON.parse(read(url));
const root = new URL('../../../', import.meta.url);
const skills = SkillFileVersioned.migrate(json(new URL('../content/class/skills.json', root))).skills;
const classes = ClassFileVersioned.migrate(json(new URL('../content/class/classes.json', root))).classes;
const motions = parseAsepriteSheet(json(new URL('assets/verdant/motions/export/hero-motions.sheet.json', root)));
const skillFxSource = read(new URL('engine/src/feel/SkillFx.ts', root));
const iconsSource = read(new URL('engine/src/ui/skillIcons.ts', root));

describe('技能資料', () => {
  it('每個職業 1–8 個技能，都存在、不重複、屬於該職業', () => {
    const byId = new Map(skills.map((s) => [s.id, s]));
    for (const c of classes) {
      expect(c.skills.length).toBeGreaterThan(0);
      expect(c.skills.length).toBeLessThanOrEqual(8);
      expect(new Set(c.skills).size).toBe(c.skills.length);
      for (const id of c.skills) {
        expect(byId.get(id)?.classId, id).toBe(c.id);
        expect(byId.get(id)?.kind, id).toBe('active');
      }
    }
  });

  it('整體動畫 Tag 都在森境旅人動作圖集裡', () => {
    for (const skill of skills) {
      if (skill.motion) expect(motions.tags.has(skill.motion.tag), `${skill.id} ${skill.motion.tag}`).toBe(true);
    }
  });

  it('特效名稱都有實作、技能列圖示都存在', () => {
    for (const skill of skills) {
      const names = [...skill.strikes.flatMap((s) => (s.fx ? [s.fx] : [])), ...(skill.cues ?? []).map((c) => c.fx)];
      for (const name of names) expect(skillFxSource.includes(`case '${name}':`), `${skill.id} fx ${name}`).toBe(true);
      if (skill.kind === 'active') expect(iconsSource.includes(`  ${skill.icon}: '`), `${skill.id} icon ${skill.icon}`).toBe(true);
    }
  });

  it('技能押注倍數：普攻 1、技能 1–20、大絕招 20，滿價隻數至少 1', () => {
    for (const skill of skills) {
      const price = skill.price ?? 1;
      if (skill.kind === 'basic') expect(price, skill.id).toBe(1);
      expect(price, skill.id).toBeGreaterThanOrEqual(1);
      expect(price, skill.id).toBeLessThanOrEqual(20);
      if (skill.ultimate) expect(price, skill.id).toBe(20);
      expect(skill.fullTargets ?? 1, skill.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('判定時間由小到大，位移與演出時點落在技能期間內', () => {
    for (const skill of skills) {
      const times = skill.strikes.map((s) => s.atMs);
      expect(times, skill.id).toEqual([...times].sort((a, b) => a - b));
      const last = times.at(-1)!;
      if (skill.move) expect(skill.move.atMs, skill.id).toBeLessThanOrEqual(last);
      for (const cue of skill.cues ?? []) expect(cue.atMs, skill.id).toBeLessThanOrEqual(last);
    }
  });
});
