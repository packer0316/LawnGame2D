import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {SkillFileVersioned,ClassFileVersioned} from '@lawn/shared';
import {graspAnchors,GRASP_SKILL,GRASP_TIMING as T} from './InfernalGraspTiming';
import {impactFeel} from './SkillPresentation';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../../content/class/${name}.json`,import.meta.url),'utf8'));
describe('冥獄之握',()=>{
  it('uses the lowest terrain at each column, including sloped floors; anchors stay spaced',()=>{
    const terrain=[{x1:0,y1:200,x2:1440,y2:200},{x1:0,y1:500,x2:1440,y2:644}];
    const hands=graspAnchors({x:0,y:0,w:1440,h:700},terrain);
    expect(hands).toHaveLength(6);
    for(const [i,h]of hands.entries()){
      expect(h.y).toBeCloseTo(500+h.x*.1);
      if(i)expect(h.x-hands[i-1]!.x).toBeGreaterThan(h.width*.8);
    }
    expect(graspAnchors({x:0,y:0,w:1440,h:700},[]).every(h=>Number.isFinite(h.y))).toBe(true);
  });
  it('fills mage slot 8 and binds eight map hits to the crush timeline',()=>{
    const skill=SkillFileVersioned.migrate(read('skills')).skills.find(s=>s.id===GRASP_SKILL)!;
    const mage=ClassFileVersioned.migrate(read('classes')).classes.find(c=>c.id==='mage')!;
    expect(mage.skills[7]).toBe(GRASP_SKILL);
    expect(skill.strikes.map(s=>s.atMs)).toEqual([...T.hits]);
    expect(skill.strikes.every(s=>s.area.shape==='map'&&s.maxTargets>=1000)).toBe(true);
    expect(T.rise+7*T.riseGap+T.riseLife).toBeLessThan(T.hits[0]-150);
    expect(skill.cancelFromMs).toBe(T.end);
    expect(impactFeel(skill,0).stopMs).toBe(32);expect(impactFeel(skill,7).stopMs).toBe(115);
  });
});
