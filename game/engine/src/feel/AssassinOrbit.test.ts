import {describe,it,expect} from 'vitest';
import {STORM_ORBIT,stormBladePose,stormLaunchMs} from './AssassinOrbit';

describe('six-blade tangent release',()=>{
  it('releases six different blades one by one at the same orbital tangent',()=>{
    const times=Array.from({length:6},(_,i)=>stormLaunchMs(i));
    expect(new Set(times).size).toBe(6);
    for(let i=0;i<6;i++){
      const p=stormBladePose(i,times[i]!,1),first=stormBladePose(0,times[0]!,1);
      expect(p.x).toBeCloseTo(first.x);expect(p.y).toBeCloseTo(first.y);
      expect(stormBladePose(i,times[i]!-1,1).flying).toBe(false);
      expect(p.flying).toBe(true);
    }
  });
  it('preserves position and velocity at detachment in both directions',()=>{
    for(const facing of [1,-1] as const)for(let i=0;i<6;i++){
      const time=stormLaunchMs(i),a=stormBladePose(i,time-.01,facing),b=stormBladePose(i,time,facing),c=stormBladePose(i,time+.01,facing);
      expect((b.x-a.x)/.01).toBeCloseTo((c.x-b.x)/.01,3);
      expect((b.y-a.y)/.01).toBeCloseTo((c.y-b.y)/.01,3);
      expect((c.x-b.x)*facing).toBeGreaterThan(0);
    }
  });
  it('mirrors the path and fades only at the end of flight',()=>{
    for(let time=0;time<2400;time+=17){
      const r=stormBladePose(3,time,1),l=stormBladePose(3,time,-1);
      expect(l.x).toBe(-r.x);expect(l.y).toBe(r.y);
    }
    expect(stormBladePose(5,stormLaunchMs(5)+400,1).alpha).toBe(1);
    expect(stormBladePose(5,stormLaunchMs(5)+STORM_ORBIT.flightMs,1).done).toBe(true);
  });
});
