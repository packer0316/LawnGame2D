import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ThemeFileSchema, MapDefSchema } from '@lawn/shared';
import catalog from '../../../assets/landmarks/catalog.json';
import { landmarkTiles } from './landmarks';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
describe('景點場景整套素材',()=>{
  it('正式房間、主題、地形、背景與分類對應完整',()=>{
    const themes=ThemeFileSchema.parse(JSON.parse(fs.readFileSync(path.join(root,'content/themes/themes.json'),'utf8'))).themes;
    const rooms=JSON.parse(fs.readFileSync(path.join(root,'content/rooms/rooms.json'),'utf8')).rooms as {id:number;name:string}[];
    expect(new Set(catalog.scenes.map(s=>s.themeId)).size).toBe(catalog.scenes.length);
    for(const s of catalog.scenes){
      const theme=themes.find(t=>t.id===s.themeId)!;
      expect(theme,s.id).toBeDefined();
      for(const asset of [theme.tileset.image,theme.tileset.normal!,...theme.backgrounds.map(bg=>bg.image)])expect(fs.existsSync(path.join(root,'content',asset)),asset).toBe(true);
      for(const id of s.roomIds){
        const map=MapDefSchema.parse(JSON.parse(fs.readFileSync(path.join(root,`content/maps/map_${String(id).padStart(4,'0')}.json`),'utf8')));
        expect(map.theme).toBe(s.themeId);
        expect(map.tileLayers.every(l=>l.tileset===theme.tileset.image)).toBe(true);
        expect(rooms.find(r=>r.id===id)?.name).toBe(s.name);
      }
    }
  });
  it('每套地形覆蓋實地、單向平台與斜面，透明區不超出碰撞邊界',()=>{
    for(const s of catalog.scenes){
      const tiles=landmarkTiles(s);
      const alpha=(id:number,x:number,y:number)=>tiles.alpha(id%8*16+x,Math.floor(id/8)*16+y);
      for(const id of [1,2,3,4,5,6,7,8,16,17,18,...Array.from({length:16},(_,i)=>32+i)])for(let y=0;y<16;y++)for(let x=0;x<16;x++)expect(alpha(id,x,y),`${s.id} tile ${id}`).toBe(255);
      for(const id of [11,12,13])for(let x=0;x<16;x++)expect(alpha(id,x,0)).toBe(255);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){
        expect(alpha(9,x,y),`${s.id} uphill`).toBe(y>=15-x?255:0);
        expect(alpha(10,x,y),`${s.id} downhill`).toBe(y>=x?255:0);
      }
    }
  });
});
