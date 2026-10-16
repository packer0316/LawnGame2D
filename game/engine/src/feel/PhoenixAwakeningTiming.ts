import type {Rect} from '@lawn/shared';
export const PHOENIX_SKILL='skill_0050';
export const PHOENIX_TIMING={eye:360,draw:720,launch:1200,exit:1920,entrance:2100,
  hits:Array.from({length:56},(_,i)=>2850+i*45),end:5950} as const;
export const phoenixFlightMs=(index:number)=>550+Math.sin(index*.7)*55;
export const phoenixClamp=(t:number)=>Math.max(0,Math.min(1,t));
/** Low initial drift, then continuously increasing speed through the homing dive. */
export function phoenixTravelProgress(t:number){t=phoenixClamp(t);return .12*t+.88*t*t*t;}
export function phoenixCorner(bounds:Rect,playerX:number){
  const right=playerX>bounds.x+bounds.w/2;
  return {x:bounds.x+bounds.w*(right?.83:.17),y:bounds.y+bounds.h*.18,right};
}
/** Accelerating curved feathers; exact endpoints keep the impact clock honest. */
export function phoenixFlight(from:{x:number;y:number},to:{x:number;y:number},progress:number,bend:number){
  const p=phoenixTravelProgress(progress),q=1-p;
  const dir=to.x>=from.x?1:-1;
  // Launch sideways and upward, curl into a dive, then accelerate toward the live target.
  const c1={x:from.x-dir*bend*.7,y:from.y-bend};
  const c2={x:to.x-dir*bend*.9,y:to.y-bend*.75};
  return {x:q*q*q*from.x+3*q*q*p*c1.x+3*q*p*p*c2.x+p*p*p*to.x,
    y:q*q*q*from.y+3*q*q*p*c1.y+3*q*p*p*c2.y+p*p*p*to.y};
}
