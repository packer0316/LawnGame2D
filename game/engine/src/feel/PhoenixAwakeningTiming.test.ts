import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {SkillFileVersioned,ClassFileVersioned} from '@lawn/shared';
import {PHOENIX_SKILL,PHOENIX_TIMING as T,phoenixCorner,phoenixFlight,phoenixFlightMs,phoenixTravelProgress} from './PhoenixAwakeningTiming';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../../content/class/${name}.json`,import.meta.url),'utf8'));
describe('紫焰鳳凰',()=>{
  it('binds slot 8 to continuous 45ms contacts after a complete vertical exit',()=>{
    const skill=SkillFileVersioned.migrate(read('skills')).skills.find(s=>s.id===PHOENIX_SKILL)!;
    const archer=ClassFileVersioned.migrate(read('classes')).classes.find(c=>c.id==='archer')!;
    expect(archer.skills[7]).toBe(PHOENIX_SKILL);
    expect(skill.strikes.map(s=>s.atMs)).toEqual([...T.hits]);
    expect(skill.strikes).toHaveLength(56);
    expect(skill.strikes.every(s=>s.area.shape==='map'&&s.maxTargets===3)).toBe(true);
    const emissions=T.hits.map((at,i)=>at-phoenixFlightMs(i)).sort((a,b)=>a-b);
    for(let i=1;i<T.hits.length;i++)expect(T.hits[i]!-T.hits[i-1]!).toBe(45);
    for(let i=1;i<emissions.length;i++)expect(emissions[i]!-emissions[i-1]!).toBeLessThanOrEqual(100);
    expect(T.launch).toBeLessThan(T.exit);expect(T.exit).toBeLessThan(T.entrance);
    expect(emissions[0]).toBeGreaterThan(T.entrance);expect(skill.cancelFromMs).toBe(T.end);
  });
  it('selects a mirrored upper corner; accelerated feathers reach targets exactly',()=>{
    const b={x:100,y:50,w:1400,h:700},left=phoenixCorner(b,150),right=phoenixCorner(b,1450);
    expect(left.right).toBe(false);expect(right.right).toBe(true);
    expect(left.x+right.x).toBeCloseTo(2*b.x+b.w);
    const target={x:1000,y:650};
    expect(phoenixFlight(left,target,0,60)).toEqual({x:left.x,y:left.y});
    const end=phoenixFlight(left,target,1,60);expect(end.x).toBe(target.x);expect(end.y).toBeCloseTo(target.y);
    expect(phoenixFlight(left,target,.25,0).x-left.x).toBeLessThan((target.x-left.x)*.25);
  });
  it('drifts outward slowly, then accelerates strongly without a speed discontinuity',()=>{
    expect(phoenixTravelProgress(.4)).toBeLessThan(.11);
    const spans=[0,.2,.4,.6,.8].map(t=>phoenixTravelProgress(t+.2)-phoenixTravelProgress(t));
    for(let i=1;i<spans.length;i++)expect(spans[i]).toBeGreaterThan(spans[i-1]!);
    expect(spans[4]!).toBeGreaterThan(spans[0]!*10);
    expect(phoenixTravelProgress(-1)).toBe(0);expect(phoenixTravelProgress(2)).toBe(1);
  });
});
