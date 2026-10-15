import type { Rect } from '@lawn/shared';

export const MOON_SKILL = 'skill_0048';
/** One fixed clock drives the cut-in, shadow waves, sheathing and actual strike cues. */
export const MOON_TIMING = {
  eye: 620, moon: 850, shadows: 1600, waveGap: 360, shadowLife: 530, sheath: 2770, lock: 3000,
  hits: [3120, 3240, 3350, 3450, 3540, 3620, 3690, 3910], end: 4400,
} as const;
export type MoonPoint = { x: number; y: number };
/** Spread cosmetic clones across occupied tiers; crowded packs do not produce overlapping clones. */
export function moonShadowAnchors(bounds:Rect,targets:readonly MoonPoint[]):MoonPoint[]{
  const candidates=targets.filter(p=>p.x>=bounds.x&&p.x<=bounds.x+bounds.w&&p.y>=bounds.y&&p.y<=bounds.y+bounds.h)
    .map(p=>({...p})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const chosen:MoonPoint[]=[];
  const distance=(a:MoonPoint,b:MoonPoint)=>Math.hypot((a.x-b.x)/bounds.w,(a.y-b.y)/bounds.h);
  while(candidates.length&&chosen.length<6){
    let index=0,best=-1;
    for(let i=0;i<candidates.length;i++){
      const d=chosen.length?Math.min(...chosen.map(p=>distance(p,candidates[i]!))):1;
      if(d>best){index=i;best=d;}
    }
    if(chosen.length&&best<.1)break;
    chosen.push(candidates.splice(index,1)[0]!);
  }
  return chosen;
}
