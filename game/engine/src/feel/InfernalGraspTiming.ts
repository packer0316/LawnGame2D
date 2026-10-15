import type {Rect} from '@lawn/shared';
import type {RainSegment} from './RainGeometry';
export const GRASP_SKILL='skill_0049';
export const GRASP_TIMING={rise:950,riseGap:105,riseLife:720,struggle:2400,
  hits:[3100,3270,3430,3580,3720,3850,4030,4320],end:4950} as const;
export function graspAnchors(bounds:Rect,terrain:readonly RainSegment[]){
  const count=Math.max(4,Math.min(8,Math.round(bounds.w/240))),spacing=bounds.w/count;
  return Array.from({length:count},(_,i)=>{
    const x=bounds.x+spacing*(i+.5);
    const surfaces=terrain.filter(s=>s.x2>s.x1&&x>=s.x1&&x<=s.x2)
      .map(s=>s.y1+(s.y2-s.y1)*(x-s.x1)/(s.x2-s.x1));
    const y=surfaces.length?Math.max(...surfaces):bounds.y+bounds.h-60;
    return {x,y,width:spacing*1.12,height:Math.max(240,Math.min(610,y-bounds.y-45-(i%3)*35))};
  });
}
