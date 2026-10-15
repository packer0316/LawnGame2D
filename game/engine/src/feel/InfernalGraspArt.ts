import type * as Phaser from 'phaser';
import {loadImages} from '../render/sheets';
import hands from '../../../assets/skills/infernal-grasp/hands-v1.png?url';
import portrait from '../../../assets/skills/infernal-grasp/portrait-v1.png?url';
import crush from '../../../assets/skills/infernal-grasp/crush-v1.png?url';
const ART={hands:{url:hands,rows:4},portrait:{url:portrait,rows:2},crush:{url:crush,rows:2}};
export const graspKey=(name:keyof typeof ART)=>`infernal-grasp-${name}`;
export async function loadInfernalGraspArt(scene:Phaser.Scene):Promise<void>{
  await loadImages(scene,{imageUrl:async p=>p,json:async()=>{throw Error('Bundled infernal art');}},
    Object.entries(ART).map(([name,a])=>({key:graspKey(name as keyof typeof ART),path:a.url})));
  for(const [name,a]of Object.entries(ART)){
    const texture=scene.textures.get(graspKey(name as keyof typeof ART)),image=texture.getSourceImage() as HTMLImageElement;
    for(let i=0;i<4*a.rows;i++){
      const x=Math.floor(i%4*image.width/4),y=Math.floor(Math.floor(i/4)*image.height/a.rows);
      const r=Math.floor((i%4+1)*image.width/4),b=Math.floor((Math.floor(i/4)+1)*image.height/a.rows);
      if(!texture.has(String(i)))texture.add(i,0,x,y,r-x,b-y);
    }
  }
}
