import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { SkillFileVersioned } from '@lawn/shared';
import { impactFeel } from './SkillPresentation';
const skills=SkillFileVersioned.migrate(JSON.parse(readFileSync(new URL('../../../../content/class/skills.json',import.meta.url),'utf8'))).skills;
describe('技能表現節奏',()=>{
  it('連續技中段短頓、終結段重頓，不改寫技能判定資料',()=>{
    const before=JSON.stringify(skills);
    for(const skill of skills){
      const end=impactFeel(skill,skill.strikes.length-1);
      expect(end.stopMs).toBeLessThanOrEqual(115);
      expect(end.pixels).toBeLessThanOrEqual(7);
      for(let i=0;i<skill.strikes.length-1;i++){
        const beat=impactFeel(skill,i);
        expect(beat.stopMs).toBeLessThanOrEqual(22);
        expect(beat.stopMs).toBeLessThanOrEqual(end.stopMs);
        expect(beat.pixels).toBeLessThanOrEqual(end.pixels);
      }
    }
    expect(JSON.stringify(skills)).toBe(before);
  });
  it('快速連鎖每段最多 10ms，單發拔刀保留重擊重量',()=>{
    const chain=skills.find(s=>s.name==='連鎖閃電')!;
    expect(impactFeel(chain,0).stopMs).toBeLessThanOrEqual(10);
    const iaido=skills.find(s=>s.name==='拔刀斬')!;
    expect(impactFeel(iaido,0).stopMs).toBeGreaterThanOrEqual(100);
  });
});
