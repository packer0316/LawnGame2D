import type * as Phaser from 'phaser';
import type {MapDef} from '@lawn/shared';

/** Small coastal plants and cargo crates; purely decorative and behind actors. */
export function drawSantoriniScenery(g:Phaser.GameObjects.Graphics,map:MapDef):void{
  const clear=(x:number,y:number,margin:number)=>
    !map.climbables.some(c=>Math.abs(c.x-x)<margin+18&&y>=c.yTop-24&&y<=c.yBottom+24)
    &&!map.portals.some(p=>Math.abs(p.x-x)<margin+55&&Math.abs(p.y-y)<70);
  const grass=(x:number,y:number,seed:number)=>{
    g.fillStyle(0x75865a,.7).fillRect(x-8,y,17,2);
    for(let i=0;i<7;i++){
      const bx=Math.round(x-7+i*2),h=5+(seed+i*7)%9;
      g.lineStyle(1,i%2?0x7c965d:0x4c765b).lineBetween(bx,y,bx+(i-3)*1.2,y-h);
      if(i%3===0)g.fillStyle(0xb5c887).fillRect(bx+(i-3),y-h,2,2);
    }
    if(seed%4===0){g.fillStyle(0xe8db9a).fillRect(x+4,y-9,2,2).fillRect(x-4,y-6,2,2);}
  };
  const crate=(x:number,y:number,w:number,h:number)=>{
    x=Math.round(x);y=Math.round(y);
    g.fillStyle(0x536658,.2).fillEllipse(x+w/2,y+1,w+8,5);
    g.fillStyle(0x584b39).fillRect(x,y-h,w,h);
    g.fillStyle(0x9d794f).fillRect(x+2,y-h+2,w-4,h-4);
    for(let k=6;k<w-2;k+=7){
      g.lineStyle(1,0x71573d).lineBetween(x+k,y-h+3,x+k,y-3);
      g.lineStyle(1,0xb99a6a).lineBetween(x+k+1,y-h+3,x+k+1,y-3);
    }
    g.lineStyle(3,0xcea876).lineBetween(x+3,y-4,x+w-4,y-h+4);
    g.fillStyle(0xbd9867).fillRect(x+1,y-h+1,w-2,3).fillRect(x+1,y-4,w-2,3);
    g.lineStyle(1,0xe2c68e).lineBetween(x+2,y-h+1,x+w-2,y-h+1);
    for(const px of [x+3,x+w-4])for(const py of [y-h+3,y-3])g.fillStyle(0x4c5d5c).fillRect(px,py,2,2);
    g.fillStyle(0x416f84).fillRect(x+w-9,y-h+7,4,5);
  };
  for(const fh of map.footholds)for(let i=0;i<fh.points.length-1;i++){
    const a=fh.points[i]!,b=fh.points[i+1]!,length=b[0]-a[0];
    if(length<45)continue;
    for(let x=a[0]+24;x<b[0]-18;x+=67+(Math.floor(x+a[1])%37)){
      const y=a[1]+(b[1]-a[1])*(x-a[0])/length;
      if(clear(x,y,10))grass(x,y,Math.floor(x+a[1]));
    }
    if(a[1]!==b[1]||length<200)continue;
    const x=Math.round(a[0]+length*.7),y=a[1];
    if(clear(x+18,y,35)){
      crate(x,y,32,26);
      if(length>500&&clear(x+49,y,20))crate(x+34,y,23,19);
      grass(x-8,y,3);
    }
  }
}
