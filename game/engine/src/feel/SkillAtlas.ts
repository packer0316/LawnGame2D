import * as Phaser from 'phaser';
import reaper from '../../../assets/skills/reaper-sequence.png?url';
import blade from '../../../assets/skills/blade-sequence.png?url';
import fire from '../../../assets/skills/fire-sequence.png?url';
import arcane from '../../../assets/skills/arcane-sequence.png?url';
import shadow from '../../../assets/skills/shadow-sequence.png?url';
import fuma from '../../../assets/skills/fuma-v3.png?url';
import arrows from '../../../assets/skills/archer-arrows-v3.png?url';
import sword from '../../../assets/skills/holy-sword-v3.png?url';
import earth from '../../../assets/skills/earth-sequence-v4.png?url';
import dragon from '../../../assets/skills/dragon-sequence-v4.png?url';
import lightning from '../../../assets/skills/lightning-sequence-v4.png?url';
import soul from '../../../assets/skills/soul-sequence-v4.png?url';

export type SkillAtlasName = 'reaper' | 'blade' | 'fire' | 'arcane' | 'shadow' | 'earth' | 'dragon' | 'lightning' | 'soul';
const SHEETS = { reaper, blade, fire, arcane, shadow, earth, dragon, lightning, soul };
export const BURST_DURATION:Record<Exclude<SkillAtlasName,'reaper'>,number>={blade:320,fire:440,arcane:320,shadow:320,earth:580,dragon:720,lightning:360,soul:460};
export const atlasKey = (name: SkillAtlasName): string => `skill-sequence-${name}`;

/** Raster frames retain their shared cell origin; never trim each pose independently. */
export async function loadSkillAtlases(scene: Phaser.Scene): Promise<void> {
  const weapons = { 'skill-fuma': fuma, 'skill-arrows': arrows, 'skill-holy-sword': sword };
  const weaponMissing=Object.entries(weapons).filter(([key])=>!scene.textures.exists(key));
  if(weaponMissing.length)await new Promise<void>((resolve,reject)=>{
    const failed:string[]=[];
    const onError=(file:Phaser.Loader.File)=>{if(file.key in weapons)failed.push(file.key);};
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR,onError);
    scene.load.once(Phaser.Loader.Events.COMPLETE,()=>{scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR,onError);failed.length?reject(new Error(`Weapon art failed: ${failed.join(', ')}`)):resolve();});
    for(const [key,url]of weaponMissing)scene.load.image(key,url);
    scene.load.start();
  });
  const arrowTexture=scene.textures.get('skill-arrows'),arrowImage=arrowTexture.getSourceImage() as HTMLImageElement;
  for(let row=0;row<2;row++)if(!arrowTexture.has(String(row))){
    const top=Math.floor(row*arrowImage.height/2),bottom=Math.floor((row+1)*arrowImage.height/2);
    arrowTexture.add(row,0,0,top,arrowImage.width,bottom-top);
  }
  const missing = (Object.keys(SHEETS) as SkillAtlasName[]).filter(name => !scene.textures.exists(atlasKey(name)));
  if (missing.length) {
    await new Promise<void>((resolve, reject) => {
      const failed: string[] = [];
      const onError = (file: Phaser.Loader.File) => { if (missing.some(n => atlasKey(n) === file.key)) failed.push(file.key); };
      scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        if (failed.length) reject(new Error(`Skill art failed to load: ${failed.join(', ')}`));
        else resolve();
      });
      for (const name of missing) scene.load.image(atlasKey(name), SHEETS[name]);
      scene.load.start();
    });
  }
  for (const name of Object.keys(SHEETS) as SkillAtlasName[]) {
    const key = atlasKey(name), texture = scene.textures.get(key);
    const source = texture.getSourceImage() as HTMLImageElement;
    const rows = name === 'reaper' ? 3 : 2;
    for (let i = 0; i < rows * 4; i++) {
      const x = Math.floor((i % 4) * source.width / 4), y = Math.floor(Math.floor(i / 4) * source.height / rows);
      const right = Math.floor((i % 4 + 1) * source.width / 4), bottom = Math.floor((Math.floor(i / 4) + 1) * source.height / rows);
      if (!texture.has(String(i))) texture.add(i, 0, x, y, right - x, bottom - y);
    }
    const define = (suffix: string, start: number, end: number, duration: number) => {
      if (!scene.anims.exists(`${key}-${suffix}`)) scene.anims.create({
        key: `${key}-${suffix}`, frames: scene.anims.generateFrameNumbers(key, { start, end }), duration,
      });
    };
    if (name === 'reaper') {
      define('summon', 0, 5, 360);
      define('sweep', 6, 9, 230);
      define('dissolve', 10, 11, 240);
    } else {
      define('burst', 0, 7, BURST_DURATION[name]);
    }
  }
}
