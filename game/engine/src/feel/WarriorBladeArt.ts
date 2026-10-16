import type * as Phaser from 'phaser';
import {loadImages} from '../render/sheets';
import whirl from '../../../assets/skills/warrior-whirl-v11.png?url';
import holy from '../../../assets/skills/warrior-moonblade-v13.png?url';

export const HOLY_BLADE_FRAMES=16;
export const warriorBladeKey=(kind:'whirl'|'holy')=>`warrior-blade-${kind}-${kind==='holy'?'v13':'v11'}`;
export async function loadWarriorBladeArt(scene:Phaser.Scene):Promise<void>{
  const sheets=[{kind:'whirl' as const,url:whirl,rows:4},{kind:'holy' as const,url:holy,rows:4}];
  await loadImages(scene,{imageUrl:async path=>path,json:async()=>{throw Error('Bundled warrior blades');}},
    sheets.map(s=>({key:warriorBladeKey(s.kind),path:s.url})));
  for(const sheet of sheets){
    const texture=scene.textures.get(warriorBladeKey(sheet.kind)),image=texture.getSourceImage() as HTMLImageElement;
    for(let i=0;i<sheet.rows*4;i++)if(!texture.has(String(i))){
      const inset=0;
      const x=Math.floor(i%4*image.width/4),y=Math.floor(Math.floor(i/4)*image.height/sheet.rows);
      const r=Math.floor((i%4+1)*image.width/4),b=Math.floor((Math.floor(i/4)+1)*image.height/sheet.rows);
      texture.add(i,0,x+inset,y+inset,r-x-inset*2,b-y-inset*2);
    }
  }
}
