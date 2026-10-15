import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ThemeFile } from '@lawn/shared';
import catalog from '../../../assets/landmarks/catalog.json';
import { Canvas, hex, shade } from './raster';
import { writeJson, writePng } from './sheet';
import { normalMap } from './world';

type Scene = typeof catalog.scenes[number];

/** 沿用 Verdant 的 48 格圖塊索引，但各景點使用不同砌法、平台結構與梯具。 */
export function landmarkTiles(s: Scene): Canvas {
  const c = new Canvas(128, 96);
  const stone = hex(s.stone), joint = hex(s.joint), surface = hex(s.surface), beam = hex(s.beam), accent = hex(s.accent);
  const wood = ['wood', 'timber', 'lacquer'].includes(s.platform);
  const texture = (x: number, y: number) => {
    const courseHeight = s.material === 'slate' ? 8 : s.material === 'sandstone' ? 16 : 12;
    const row = Math.floor(y / courseHeight);
    const bx = (x + (row % 2) * 12) % 24, by = y % courseHeight;
    const grain = ((x * 17 + y * 31) % 13) * 0.006;
    if (s.material === 'moss') {
      const seam = (x + Math.floor(y / 7) * 5) % 19 === 0 || (y + Math.floor(x / 11) * 3) % 17 === 0;
      return seam ? joint : shade(stone, 0.86 + grain + ((x + y * 3) % 7) * 0.022);
    }
    if (s.material === 'plaster') {
      // 灰泥牆的大面積柔和紋理；僅低密度修補接縫。
      return by === 0 && (row % 3 === 0 || bx < 7) ? shade(stone, 0.85) : shade(stone, 0.96 + grain * 0.25);
    }
    if (by === 0 || bx === 0) return joint;
    return shade(stone, (by === 1 ? 1.18 : 0.91) + grain + (row % 3) * 0.035);
  };
  for (const id of [1,2,3,4,5,6,7,8,9,10,16,17,18,...Array.from({length:16},(_,i)=>32+i)]) {
    const ox = id % 8 * 16, oy = Math.floor(id / 8) * 16;
    for (let y=0;y<16;y++) for(let x=0;x<16;x++) {
      const top = id === 9 ? 15-x : id === 10 ? x : 0;
      if(y<top) continue;
      const tx=id>=32?(id-32)%4*16+x:x, ty=id>=32?Math.floor((id-32)/4)*16+y:y;
      let color=texture(tx,ty);
      if ((id<=4 || id===9 || id===10) && y-top<3) color=y===top?surface:shade(surface,0.76);
      c.set(ox+x,oy+y,color);
    }
    if(s.material==='sandstone' && id>=32 && id%4===1) {
      // 重複幾何石刻，不使用假文字；石刻處於牆身，不干擾可走邊界。
      c.line(ox+4,oy+5,ox+7,oy+8,joint);c.line(ox+7,oy+8,ox+10,oy+5,joint);c.line(ox+4,oy+11,ox+10,oy+11,shade(surface,0.8));
    }
    if((id===9 || id===10) && s.material!=='moss') {
      // 斜坡內側刻出石階踏面，仍保留既有斜面外輪廓與碰撞邊界。
      for(let x=0;x<16;x+=4) {
        const y=id===9?15-x:x+3;
        c.line(ox+x,oy+y,ox+x+3,oy+y,surface);
        if(y<15)c.line(ox+x,oy+y+1,ox+x+3,oy+y+1,joint);
      }
    }
  }
  for (const id of [11,12,13]) {
    const x=id%8*16,y=Math.floor(id/8)*16;
    c.fillRect(x,y,16,wood?10:13,shade(beam,0.58));
    c.fillRect(x,y+1,16,wood?7:10,beam);
    c.fillRect(x,y,16,2,surface);
    if(wood) {
      c.line(x+1,y+4,x+14,y+4,shade(beam,1.28));
      c.line(x+3,y+7,x+12,y+7,shade(beam,0.7));
      c.fillRect(x+13,y+2,2,7,s.platform==='lacquer'?joint:accent);
      c.set(x+13,y+3,surface);
      if(s.platform==='timber') {c.line(x,y+10,x+7,y+14,shade(beam,0.65));c.line(x+7,y+14,x+15,y+10,shade(beam,0.65));}
      if(s.platform==='lacquer') c.fillRect(x,y+8,16,2,accent);
    } else {
      c.line(x,y+4,x+15,y+4,accent);
      c.line(x+15,y+5,x+15,y+10,joint);
      c.line(x,y+11,x+15,y+11,shade(surface,0.8));
      if(s.platform==='carved') {c.line(x+4,y+6,x+8,y+9,accent);c.line(x+8,y+9,x+12,y+6,accent);}
      if(s.platform==='terrace') c.fillRect(x+5,y+6,5,3,shade(surface,1.06));
    }
    if(id!==12) c.fillRect(x+(id===11?0:14),y+2,2,wood?8:11,accent);
  }
  // 梯子頂端與踏板對齊；白石場景用藍色金屬梯，其餘用各自木材或銅色綁帶。
  const lx=14%8*16,ly=Math.floor(14/8)*16;
  const rail=s.platform==='terrace'?accent:beam;
  c.fillRect(lx+3,ly,2,16,rail);c.fillRect(lx+11,ly,2,16,rail);
  for(const yy of [3,11]) {c.fillRect(lx+3,ly+yy,10,2,shade(rail,1.3));c.set(lx+3,ly+yy,surface);c.set(lx+11,ly+yy,surface);}
  if(s.platform==='timber')for(const yy of [1,9]){c.fillRect(lx+2,ly+yy,4,1,accent);c.fillRect(lx+10,ly+yy,4,1,accent);}
  if(s.platform==='carved')for(const yy of [5,13])c.fillRect(lx+4,ly+yy,8,1,accent);
  const rx=15%8*16,ry=Math.floor(15/8)*16;
  for(let y=0;y<16;y++){c.set(rx+7+(y%2),ry+y,surface);c.set(rx+8-(y%2),ry+y,shade(beam,0.8));}
  return c;
}

/** 可單獨更新正式背景／地形／主題，不碰角色、技能、地圖碰撞與房間數值。 */
export function writeLandmarks(contentDir: string): void {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/landmarks');
  const themePath=path.join(contentDir,'themes/themes.json');
  const file: ThemeFile=JSON.parse(fs.readFileSync(themePath,'utf8'));
  fs.mkdirSync(path.join(contentDir,'backgrounds'),{recursive:true});
  for(const s of catalog.scenes) {
    const tiles=landmarkTiles(s);
    writePng(path.join(contentDir,`tilesets/${s.id}.png`),tiles);
    writePng(path.join(contentDir,`tilesets/${s.id}_n.png`),normalMap(tiles,1.1,16));
    fs.copyFileSync(path.join(source,`${s.id}.png`),path.join(contentDir,`backgrounds/${s.id}_painted.png`));
    const theme={id:s.themeId,ambient:{color:s.ambient,intensity:s.intensity},tileset:{image:`tilesets/${s.id}.png`,normal:`tilesets/${s.id}_n.png`},backgrounds:[{image:`backgrounds/${s.id}_painted.png`,rx:0.08,ry:0.03,tileX:false,tileY:false,y:0}]};
    const index=file.themes.findIndex(t=>t.id===s.themeId);
    if(index<0)file.themes.push(theme);else file.themes[index]=theme;
  }
  writeJson(themePath,file);
}
