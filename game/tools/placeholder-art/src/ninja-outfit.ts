/** Pack imagegen costume artwork into the existing 128px actor format. No painting or recoloring. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Canvas } from './raster';
import { cellsOf, stamp } from './hero-motions';
import { heroPlacement, heroPoses } from './painted';
import { writeSheet, writePng, type SheetFrame } from './sheet';

const root = fileURLToPath(new URL('../../../assets/outfits/ninja/', import.meta.url));
const content = JSON.parse(fs.readFileSync(new URL('../../../../content/avatar/base.sheet.json', import.meta.url), 'utf8'));
const original = JSON.parse(fs.readFileSync(new URL('../../../assets/verdant/motions/export/motions.json', import.meta.url), 'utf8'));
function read(file: string) {
  const png = PNG.sync.read(fs.readFileSync(file)), canvas = new Canvas(png.width, png.height);
  canvas.data.set(png.data); return canvas;
}
const base = read(path.join(root,'base-v1.png')), poses = cellsOf(base);
const ref = read(fileURLToPath(new URL('../../../assets/verdant/hero.png', import.meta.url))), references = cellsOf(ref);
const ratio = base.width/ref.width, baseScale = 62/heroPoses()[0]!.height/ratio;
const frames: SheetFrame[] = [];
const baseContact = new Canvas(128*8,128*9);
for (const tag of content.meta.frameTags) {
  for(let frame=tag.from;frame<=tag.to;frame++) {
    const place = heroPlacement(tag.name,frame-tag.from), pose=poses[place.pose]!, reference=references[place.pose]!;
    const canvas=new Canvas(128,128);
    const hip=(reference.x+reference.w*.42)*ratio;
    const bob=tag.name==='stand'&&frame-tag.from>1&&frame-tag.from<5?1:0;
    stamp(canvas,pose.canvas,[Math.round(64-(hip-pose.x)*baseScale),Math.round(120-pose.h*baseScale+bob)],baseScale);
    const bounds=canvas.bounds();if(!bounds||bounds.x<1||bounds.x+bounds.w>=128)throw new Error(`Base clipped ${frame}`);
    frames.push({layer:'body',index:frame,canvas,durationMs:content.frames.find((f:any)=>f.filename===`body|${frame}`).duration});
    baseContact.draw(canvas,(frame%8)*128,Math.floor(frame/8)*128);
  }
}
const out=path.join(root,'export');
writeSheet(out,'ninja-base',{frames,tags:content.meta.frameTags,slices:content.meta.slices,layers:['body']});
writePng(path.join(out,'base-contact.png'),baseContact);

const sourceCache=new Map<string,{image:Canvas;cells:ReturnType<typeof cellsOf>}>();
const motionFrames:SheetFrame[]=[],tags:{name:string;from:number;to:number}[]=[];
const motionContact=new Canvas(128*8,128*12);
for(const clip of original.clips) {
  tags.push({name:clip.id,from:clip.from,to:clip.to});
  for(let i=0;i<clip.frames.length;i++) {
    const info=clip.frames[i],name=info.sourceImage.replace('hero-motion-','').replace('.png','');
    let source=sourceCache.get(name);
    if(!source){const image=read(path.join(root,`${name}-v1.png`));source={image,cells:cellsOf(image)};sourceCache.set(name,source)}
    const cell=source.cells[info.sourceFrame]!, ratio=source.image.width/1254, scale=info.scale/ratio;
    const hipX=info.registration.x*ratio;
    const airborne=info.registrationTarget.y!==120;
    const footY=airborne?info.registration.y*ratio:cell.y+cell.h-1;
    const canvas=new Canvas(128,128);
    stamp(canvas,cell.canvas,[Math.round(64-(hipX-cell.x)*scale),Math.round(info.registrationTarget.y-(footY-cell.y)*scale)],scale);
    const box=canvas.bounds();if(!box||box.x<1||box.y<1||box.x+box.w>=128||box.y+box.h>=128)throw new Error(`Motion clipped ${clip.id}:${i}`);
    motionFrames.push({layer:null,index:info.frame,canvas,durationMs:clip.timing[i]});
    motionContact.draw(canvas,i*128,(tags.length-1)*128);
  }
}
writeSheet(out,'ninja-motions',{frames:motionFrames,tags,slices:[{name:'root',keys:[{frame:0,bounds:{x:64,y:120,w:1,h:1},pivot:{x:0,y:0}}]}]});
writePng(path.join(out,'motions-contact.png'),motionContact);
console.log(JSON.stringify({baseFrames:frames.length,baseTags:content.meta.frameTags.length,motionFrames:motionFrames.length,motionTags:tags.length}));
