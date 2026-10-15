import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import { SkillFileVersioned } from '@lawn/shared';
import { impactFeel } from './SkillPresentation';
const skills=SkillFileVersioned.migrate(JSON.parse(readFileSync(new URL('../../../../content/class/skills.json',import.meta.url),'utf8'))).skills;
describe('技能表現節奏',()=>{
  it('白虎連咬沒有命中停格，保持移動',()=>{
    const tiger=skills.find(s=>s.id==='skill_0009')!;
    for(let i=0;i<tiger.strikes.length;i++)expect(impactFeel(tiger,i).stopMs).toBe(0);
  });
  it('連續技中段短頓、終結段重頓，不改寫技能判定資料',()=>{
    const before=JSON.stringify(skills);
    for(const skill of skills){
      const end=impactFeel(skill,skill.strikes.length-1);
      expect(end.stopMs).toBeLessThanOrEqual(115);
      expect(end.pixels).toBeLessThanOrEqual(7);
      for(let i=0;i<skill.strikes.length-1;i++){
        const beat=impactFeel(skill,i);
        // Ground Cleave has deliberate heavy intermediate impacts, unlike fast combos.
        expect(beat.stopMs).toBeLessThanOrEqual(skill.id==='skill_0006'?48:22);
        expect(beat.stopMs).toBeLessThanOrEqual(end.stopMs);
        expect(beat.pixels).toBeLessThanOrEqual(end.pixels);
      }
    }
    expect(JSON.stringify(skills)).toBe(before);
  });
  it('快速連鎖每段最多 10ms，拔刀終結段保留重擊重量',()=>{
    const chain=skills.find(s=>s.name==='連鎖閃電')!;
    expect(impactFeel(chain,0).stopMs).toBeLessThanOrEqual(10);
    const iaido=skills.find(s=>s.name==='拔刀斬')!;
    expect(impactFeel(iaido,iaido.strikes.length-1).stopMs).toBeGreaterThanOrEqual(100);
  });
});
