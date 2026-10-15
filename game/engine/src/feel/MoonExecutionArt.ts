import type * as Phaser from 'phaser';
import { loadImages } from '../render/sheets';
import portrait from '../../../assets/skills/moon-execution/portrait-v1.png?url';
import moon from '../../../assets/skills/moon-execution/moon-v1.png?url';
import sheath from '../../../assets/skills/moon-execution/sheath-v1.png?url';
import blades from '../../../assets/skills/moon-execution/moonblades-v4.png?url';
import shadow from '../../../assets/skills/moon-execution/shadow-clone-v4.png?url';

export const MOON_ART = {portrait:{url:portrait,rows:3},moon:{url:moon,rows:2},sheath:{url:sheath,rows:3},blades:{url:blades,rows:4},shadow:{url:shadow,rows:2}};
export const moonKey=(name:keyof typeof MOON_ART)=>`moon-execution-${name}`;
export async function loadMoonExecutionArt(scene:Phaser.Scene):Promise<void>{
  await loadImages(scene,{imageUrl:async path=>path,json:async()=>{throw Error('Bundled moon art');}},Object.entries(MOON_ART).map(([name,a])=>({key:moonKey(name as keyof typeof MOON_ART),path:a.url})));
  for(const [name,art]of Object.entries(MOON_ART)){
    const texture=scene.textures.get(moonKey(name as keyof typeof MOON_ART));
    const image=texture.getSourceImage() as HTMLImageElement;
    for(let i=0;i<4*art.rows;i++){
      const x=Math.floor(i%4*image.width/4),y=Math.floor(Math.floor(i/4)*image.height/art.rows);
      const right=Math.floor((i%4+1)*image.width/4),bottom=Math.floor((Math.floor(i/4)+1)*image.height/art.rows);
      if(!texture.has(String(i)))texture.add(i,0,x,y,right-x,bottom-y);
    }
  }
}
