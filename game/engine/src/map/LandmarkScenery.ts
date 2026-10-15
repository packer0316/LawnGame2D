import type * as Phaser from 'phaser';
import type { MapDef } from '@lawn/shared';
import catalog from '../../../assets/landmarks/catalog.json';

export const landmarkFor = (map: MapDef) => catalog.scenes.find(s=>s.themeId===map.theme);

/** 稀疏地標細節只畫於足場邊緣；不產生碰撞，也不遮住戰鬥區。 */
export function drawLandmarkScenery(g: Phaser.GameObjects.Graphics, map: MapDef): void {
  const s=landmarkFor(map);
  if(!s)return;
  const color=(hex:string)=>Number.parseInt(hex.slice(1),16);
  const stone=color(s.stone),accent=color(s.accent),surface=color(s.surface),beam=color(s.beam);
  for(const fh of map.footholds) {
    for(let i=0;i<fh.points.length-1;i++) {
      const a=fh.points[i]!,b=fh.points[i+1]!;
      if(a[1]!==b[1] || b[0]-a[0]<90)continue;
      for(let x=a[0]+55;x<b[0]-30;x+=120) {
        const y=a[1];
        // 不在攀爬出口與傳送門旁擺設。
        if(map.climbables.some(c=>Math.abs(c.x-x)<22)||map.portals.some(p=>Math.abs(p.x-x)<42&&Math.abs(p.y-y)<40))continue;
        if(s.id==='tw_jiufen') {
          g.lineStyle(2,beam).lineBetween(x,y,x,y-24).lineBetween(x,y-24,x+13,y-24);
          g.lineStyle(1,accent).lineBetween(x+11,y-24,x+11,y-20);
          g.fillStyle(accent).fillRoundedRect(x+6,y-20,10,12,4);
          g.fillStyle(0xf2c585).fillRect(x+9,y-18,2,8);
          g.lineStyle(1,0xcda25d).lineBetween(x+11,y-8,x+11,y-4);
        }else if(s.id==='tw_alishan') {
          g.lineStyle(1,0x7b9862).lineBetween(x,y,x,y-14);
          for(let k=3;k<13;k+=3){g.lineBetween(x,y-k,x-6,y-k-4);g.lineBetween(x,y-k,x+6,y-k-3);}
          g.fillStyle(beam).fillEllipse(x+18,y-3,7,3);g.lineStyle(1,surface).strokeEllipse(x+21,y-3,4,5);
        }else if(s.id==='jp_fuji') {
          g.fillStyle(stone).fillRect(x-4,y-4,8,4).fillRect(x-2,y-16,4,12).fillRect(x-5,y-22,10,7);
          g.fillStyle(0xfce3b5).fillRect(x-2,y-20,4,4);
          g.fillStyle(beam).fillTriangle(x-8,y-22,x,y-27,x+8,y-22);
          for(let j=0;j<4;j++)g.fillStyle(accent).fillEllipse(x+14+j*5,y-1-(j%2),3,1);
        }else if(s.id==='jp_kyoto') {
          g.fillStyle(beam).fillRect(x-11,y-26,3,26).fillRect(x+9,y-26,3,26);
          g.fillStyle(beam).fillRect(x-14,y-27,29,3).fillRect(x-11,y-19,23,2);
          g.fillStyle(0x302c2b).fillRect(x-16,y-29,33,3);
          g.fillStyle(surface).fillRect(x-11,y-3,3,3).fillRect(x+9,y-3,3,3);
        }else if(s.id==='gr_santorini') {
          g.fillStyle(0xb4785c).fillRect(x-4,y-8,8,8);g.fillStyle(surface).fillRect(x-5,y-9,10,2);
          g.lineStyle(1,0x547950).lineBetween(x,y-8,x,y-19);
          g.fillStyle(0xb64b86).fillCircle(x-3,y-17,3).fillCircle(x+3,y-15,3).fillCircle(x,y-21,3);
        }else{
          g.fillStyle(stone).fillRect(x-4,y-5,8,5).fillRect(x-3,y-20,6,15);
          g.fillStyle(surface).fillTriangle(x-3,y-20,x,y-27,x+3,y-20);
          g.lineStyle(1,accent).lineBetween(x,y-16,x,y-8).lineBetween(x-2,y-12,x+2,y-12);
        }
      }
    }
  }
}
