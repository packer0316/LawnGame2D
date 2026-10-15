import type { Rect } from '@lawn/shared';

export interface TigerRoute {
  left:number;
  right:number;
  direction:1|-1;
  floorY:number;
  strikes:readonly number[];
  endMs:number;
  size:number;
  jawOffset:number;
}

/** Freeze the visible lane at cast time; facing and later camera motion cannot reverse it. */
export function tigerRoute(x:number,floorY:number,view:Rect,bounds:Rect,strikes:readonly number[],size=360):TigerRoute {
  const left=Math.max(view.x,bounds.x),right=Math.min(view.x+view.w,bounds.x+bounds.w);
  return {left,right,direction:x-left<=right-x?1:-1,floorY,strikes,endMs:strikes.at(-1)!+750,size,jawOffset:104*size/360};
}

export function tigerBiteX(route:TigerRoute,index:number):number {
  const fraction=(index+.5)/route.strikes.length;
  return route.direction===1?route.left+(route.right-route.left)*fraction:route.right-(route.right-route.left)*fraction;
}

export function tigerX(route:TigerRoute,ms:number):number {
  const dir=route.direction;
  const knots=[{t:0,x:dir===1?route.left-240:route.right+240},
    ...route.strikes.map((t,i)=>({t,x:tigerBiteX(route,i)-dir*route.jawOffset})),
    {t:route.endMs,x:dir===1?route.right+300:route.left-300}];
  for(let i=1;i<knots.length;i++){
    const a=knots[i-1]!,b=knots[i]!;
    if(ms<=b.t){const p=Math.max(0,Math.min(1,(ms-a.t)/(b.t-a.t)));return a.x+(b.x-a.x)*p;}
  }
  return knots.at(-1)!.x;
}

export function tigerFrame(route:TigerRoute,ms:number):number {
  if(ms<150)return 0;
  if(ms<280)return 1;
  for(const hit of route.strikes){
    const d=ms-hit;
    if(d>=-110&&d<160)return d< -50?4:d<0?8:d<80?5:9;
  }
  const final=route.strikes.at(-1)!;
  // The dissolve drawing is reserved for when the whole solid body is already offscreen.
  const outside=route.direction===1?tigerX(route,ms)>route.right+route.size/2:tigerX(route,ms)<route.left-route.size/2;
  if(ms>final+470&&outside)return 11;
  if(ms>final+180)return 10;
  return [2,3,6,7][Math.floor(ms/75)%4]!;
}

/** A broad mouth/forepaw contact band, bounded vertically to this lane. */
export function tigerBiteRect(route:TigerRoute,index:number,floorY:number):Rect {
  const w=(route.right-route.left)/route.strikes.length+40;
  return {x:tigerBiteX(route,index)-w/2,y:floorY-100,w,h:112};
}
