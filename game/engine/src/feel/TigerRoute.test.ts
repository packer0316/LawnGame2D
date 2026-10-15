import {describe,it,expect} from 'vitest';
import {tigerRoute,tigerX,tigerFrame,tigerBiteX,tigerBiteRect} from './TigerRoute';
const view={x:0,y:0,w:1200,h:600},times=[600,1000,1400,1800,2200];

describe('blue flame tiger lane',()=>{
  it('enters from the nearest side and exits fully beyond the opposite side',()=>{
    for(const [playerX,dir]of [[100,1],[1100,-1]] as const){
      const r=tigerRoute(playerX,300,view,view,times);
      expect(r.direction).toBe(dir);
      expect(tigerX(r,0)).toBe(dir===1?-240:1440);
      expect(tigerX(r,r.endMs)).toBe(dir===1?1500:-300);
      for(let t=10;t<r.endMs;t+=10)expect((tigerX(r,t)-tigerX(r,t-10))*dir).toBeGreaterThan(1);
    }
  });
  it('keeps bites at the moving mouth, covers the lane, and excludes other heights',()=>{
    for(const x of [100,1100]){
      const r=tigerRoute(x,300,view,view,times);
      for(const [i,t]of times.entries()){
        expect(Math.abs(tigerX(r,t)+r.direction*104-tigerBiteX(r,i))).toBeLessThan(.01);
        const b=tigerBiteRect(r,i,300);
        expect(b.y).toBeGreaterThan(150);
        expect(b.y+b.h).toBeLessThan(450);
        expect(tigerFrame(r,t-20)).toBe(8); // open jaws before contact
        expect(tigerFrame(r,t)).toBe(5); // close jaws at contact
      }
      const boxes=times.map((_,i)=>tigerBiteRect(r,i,300)).sort((a,b)=>a.x-b.x);
      expect(boxes[0]!.x).toBeLessThanOrEqual(0);
      expect(boxes.at(-1)!.x+boxes.at(-1)!.w).toBeGreaterThanOrEqual(1200);
      for(let i=1;i<boxes.length;i++)expect(boxes[i]!.x).toBeLessThanOrEqual(boxes[i-1]!.x+boxes[i-1]!.w);
    }
  });
  it('freezes the route against camera changes and samples all twelve original poses',()=>{
    const camera={...view};const r=tigerRoute(200,300,camera,view,times);
    camera.x=400;
    expect(r.left).toBe(0);
    const frames=new Set<number>();for(let t=0;t<r.endMs;t+=16)frames.add(tigerFrame(r,t));
    expect([...frames].sort((a,b)=>a-b)).toEqual(Array.from({length:12},(_,i)=>i));
  });
});
