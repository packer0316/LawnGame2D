import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { SkillFileVersioned,ClassFileVersioned } from '@lawn/shared';
import { MOON_SKILL,MOON_TIMING as T,moonShadowAnchors } from './MoonExecutionTiming';
import { impactFeel } from './SkillPresentation';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../../content/class/${name}.json`,import.meta.url),'utf8'));
const skill=SkillFileVersioned.migrate(read('skills')).skills.find(s=>s.id===MOON_SKILL)!;
describe('月斷・月下影殺',()=>{
  it('第七格新增獨立大絕，八次全圖判定全部在收刀後，終結前不能取消',()=>{
    const assassin=ClassFileVersioned.migrate(read('classes')).classes.find(c=>c.id==='assassin')!;
    expect(assassin.skills[6]).toBe(MOON_SKILL);
    expect(skill.ultimate).toBe(true);
    expect(skill.strikes.map(s=>s.atMs)).toEqual([...T.hits]);
    expect(skill.strikes.every(s=>s.area.shape==='map'&&s.pierce&&s.maxTargets>=1000)).toBe(true);
    expect(T.hits[0]).toBeGreaterThan(T.lock);
    expect(skill.cancelFromMs).toBe(T.end);
    expect(skill.cancelFromMs).toBeGreaterThan(T.hits.at(-1)!);
  });
  it('分身分散到三層怪群，密集怪群不堆疊；最後一波在命中前退場',()=>{
    const bounds={x:30,y:60,w:2400,h:800};
    const tiers=[{x:250,y:180},{x:1900,y:450},{x:800,y:760}];
    const crowd=[...Array.from({length:20},(_,i)=>({x:250+i,y:180})),...tiers,{x:-1,y:200}];
    const original=JSON.stringify(crowd),anchors=moonShadowAnchors(bounds,crowd);
    expect(anchors).toHaveLength(3);
    for(const p of tiers)expect(anchors.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<30)).toBe(true);
    expect(JSON.stringify(crowd)).toBe(original);
    expect(moonShadowAnchors(bounds,[])).toEqual([]);
    expect(T.shadows+T.waveGap*2+90+T.shadowLife).toBeLessThan(T.hits[0]);
  });
  it('連爆逐步加速、終結前留拍；中段短停，末段重停',()=>{
    const gaps=T.hits.slice(1,7).map((t,i)=>t-T.hits[i]!);
    expect(gaps).toEqual([...gaps].sort((a,b)=>b-a));
    expect(T.hits[7]-T.hits[6]).toBeGreaterThan(200);
    expect(impactFeel(skill,0).stopMs).toBe(8);
    expect(impactFeel(skill,7).stopMs).toBe(105);
  });
});
