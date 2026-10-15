import {describe,it,expect} from 'vitest';
import {STORM_ORBIT,stormBladePose,stormLaunchMs,stepStormFlight,type StormFlight} from './AssassinOrbit';

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

describe('storm pursuit after tangent release',()=>{
  const start=():StormFlight=>({x:0,y:0,angle:0,age:0,speed:.32,hit:false});
  it('coasts before steering, accelerates, then reaches an off-axis monster',()=>{
    let state=start();const target={x:310,y:-170};
    for(let i=0;i<5;i++)state=stepStormFlight(state,16,target);
    expect(state.angle).toBe(0);expect(state.y).toBe(0);
    const earlySpeed=state.speed;
    for(let i=0;i<65&&!state.hit;i++)state=stepStormFlight(state,16,target);
    expect(state.hit).toBe(true);expect(state.y).toBeLessThan(-100);
    expect(state.speed).toBeGreaterThan(earlySpeed);
  });
  it('continues safely when a target disappears and can acquire a replacement',()=>{
    let state=start();
    for(let i=0;i<10;i++)state=stepStormFlight(state,16);
    expect(state.y).toBe(0);expect(state.hit).toBe(false);
    const target={x:350,y:120};
    for(let i=0;i<65&&!state.hit;i++)state=stepStormFlight(state,16,target);
    expect(state.hit).toBe(true);
    const after=stepStormFlight(state,16,{x:-200,y:-300});
    expect(after.angle).toBe(state.angle); // Cut through; never orbit a target after impact.
  });
  it('detects a target crossed between updates',()=>{
    const state={...start(),age:700,speed:1.5};
    expect(stepStormFlight(state,80,{x:85,y:0}).hit).toBe(true);
  });
});
