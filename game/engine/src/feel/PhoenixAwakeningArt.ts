import type * as Phaser from 'phaser';
import {loadImages} from '../render/sheets';
import portrait from '../../../assets/skills/phoenix-awakening/portrait-v1.png?url';
import phoenix from '../../../assets/skills/phoenix-awakening/phoenix-v1.png?url';
import effects from '../../../assets/skills/phoenix-awakening/effects-v1.png?url';
import caster from '../../../assets/skills/phoenix-awakening/caster-v1.png?url';
const ART={portrait:{url:portrait,rows:3},phoenix:{url:phoenix,rows:4},effects:{url:effects,rows:4},caster:{url:caster,rows:2}};
export const phoenixKey=(name:keyof typeof ART)=>`phoenix-awakening-${name}`;
export async function loadPhoenixAwakeningArt(scene:Phaser.Scene){
  await loadImages(scene,{imageUrl:async p=>p,json:async()=>{throw Error('Bundled phoenix art');}},
    Object.entries(ART).map(([name,a])=>({key:phoenixKey(name as keyof typeof ART),path:a.url})));
  for(const [name,a]of Object.entries(ART)){
    const tex=scene.textures.get(phoenixKey(name as keyof typeof ART)),img=tex.getSourceImage() as HTMLImageElement;
    // Generated rows have optical gutters; exclude neighboring tails and hair tips.
    const bands=name==='phoenix'?[[0,307],[312,630],[636,912],[916,1230]]:
      name==='portrait'?[[0,327],[334,689],[694,1087]]:null;
    for(let i=0;i<4*a.rows;i++){
      const row=Math.floor(i/4),x=Math.floor(i%4*img.width/4),y=bands?.[row]?.[0]??Math.floor(row*img.height/a.rows);
      const bottom=bands?.[row]?.[1]??Math.floor((row+1)*img.height/a.rows);
      if(!tex.has(String(i)))tex.add(i,0,x,y,Math.floor((i%4+1)*img.width/4)-x,bottom-y);
      if(name==='portrait'&&i<4&&!tex.has(`eye${i}`))tex.add(`eye${i}`,0,x+Math.floor(img.width/4*.14),y+Math.floor(img.height/a.rows*.59),Math.floor(img.width/4*.72),Math.floor(img.height/a.rows*.223));
    }
  }
}
