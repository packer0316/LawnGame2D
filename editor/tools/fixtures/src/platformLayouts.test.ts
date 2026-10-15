import { describe, expect, it } from 'vitest';
import { buildNavGraph, reachableFrom } from '@lawn/shared';
import { convertLdtkProject } from '../../../src/ldtk/convert';
import { footholdUnder } from '../../../src/map/geometry';
import { validateMaps } from '../../../src/map/validate';
import { buildLdtkProject } from './ldtkBuilder';
import { generateRoom } from './rooms';
import landmarks from '../../../../game/assets/landmarks/catalog.json';

const rooms = Array.from({ length: 20 }, (_, i) => generateRoom(i + 1, true));
const project = buildLdtkProject(rooms, ['forest', 'cave', 'ruins', ...landmarks.scenes.map(s=>s.id)].map(identifier => ({identifier,relPath:`tilesets/${identifier}.png`,pxWid:128,pxHei:96})));
const result = convertLdtkProject(project, { buildNav: buildNavGraph });

describe('寬平台分層地圖', () => {
  it('20 房全足場可達，傳送點、出生點與生怪區通過驗證', () => {
    expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(validateMaps(result.maps)).toEqual([]);
    for (const map of result.maps) {
      const spawn = map.portals.find(p => p.type === 'spawn')!;
      const start = footholdUnder(map, spawn.x, spawn.y)!;
      const reached = reachableFrom(map.nav, start.id);
      expect(map.footholds.every(f => reached.has(f.id)), map.id).toBe(true);
    }
  });

  it('所有房間皆有三層，主平台至少 288px 且占空中平台八成以上', () => {
    for (const map of result.maps) {
      const elevated = map.footholds.filter(f => f.oneWay);
      const wide = elevated.filter(f => f.points.at(-1)![0] - f.points[0]![0] >= 288);
      expect(wide.length, map.id).toBeGreaterThan(0);
      const length = (list: typeof elevated) => list.reduce((sum,f)=>sum+f.points.at(-1)![0]-f.points[0]![0],0);
      expect(length(wide)/length(elevated), map.id).toBeGreaterThan(0.8);
      const rows = new Set(wide.map(f=>f.points[0]![1]));
      expect(rows.size, map.id).toBe(2);
      const heights = [...rows].sort((a,b)=>a-b);
      expect(heights[1]! - heights[0]!, map.id).toBeGreaterThanOrEqual(128);
      for(const zone of map.spawnZones) {
        expect(zone.rect.w, map.id).toBeGreaterThanOrEqual(256);
        for(const id of zone.footholdIds) {
          const f=map.footholds.find(f=>f.id===id)!;
          if(f.oneWay)expect(wide.some(w=>w.id===id), `${map.id} 小平台不集中生怪`).toBe(true);
        }
      }
    }
  });

  it('地面有至少 64px 高低差與寬平地，入口及出口維持平坦', () => {
    for (const map of result.maps) {
      const ground = map.footholds.filter(f => !f.oneWay);
      const points = ground.flatMap(f => f.points);
      const heights = points.map(p => p[1]);
      expect(Math.max(...heights)-Math.min(...heights), map.id).toBeGreaterThanOrEqual(64);
      const flatLengths = ground.flatMap(f => f.points.slice(1).flatMap((p,i) => p[1] === f.points[i]![1] ? [p[0]-f.points[i]![0]] : []));
      expect(Math.max(...flatLengths), map.id).toBeGreaterThanOrEqual(160);
      const entry = map.portals.find(p=>p.type==='spawn')!;
      const exit = map.portals.find(p=>p.type==='next')!;
      expect(entry.y, map.id).toBe(exit.y);
    }
  });
});
