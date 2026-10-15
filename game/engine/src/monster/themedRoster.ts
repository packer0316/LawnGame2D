import { parseAsepriteSheet, type MapDef, type MonsterDef, type MonsterMath } from '@lawn/shared';
import type { ContentBundle, SheetAsset } from '../content/bundle';
import rosters from '../../../assets/monsters/rosters-v1.json';
import layouts from '../../../assets/monsters/atlas-layouts-v1.json';

const images = import.meta.glob('../../../assets/monsters/map_????-v1.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const PREFIX = 'themed-monsters/';
export const isThemedMonsterSheet = (path: string) => path.startsWith(PREFIX);
type Layout = { width: number; height: number; canvas: number; idleHeights: number[]; frames: {x:number;y:number;w:number;h:number}[] };
const layoutByMap = layouts as Record<string, Layout>;
export const themedMonsterId = (map: number, role: number) => `mob_${String(100 + (map - 1) * 4 + role + 1).padStart(4, '0')}`;
const ROLES = [
  { height: 34, width: 26, speed: 42, idle: [0.5, 1.3], move: [1.3, 2.7], knock: 7, idleMs: 220, walkMs: 95, dieMs: 110 },
  { height: 53, width: 38, speed: 30, idle: [0.9, 2.1], move: [1.8, 3.6], knock: 5, idleMs: 260, walkMs: 125, dieMs: 135 },
  { height: 44, width: 33, speed: 37, idle: [0.6, 1.5], move: [1.7, 3.2], knock: 6, idleMs: 180, walkMs: 95, dieMs: 120 },
  { height: 87, width: 65, speed: 17, idle: [1.6, 3.2], move: [2.8, 5.2], knock: 2, idleMs: 340, walkMs: 175, dieMs: 165 },
] as const;

/** Game-owned art pack; editor-authored content and custom maps remain intact. */
export function applyThemedRosters(bundle: ContentBundle): ContentBundle {
  const maps = new Map<string, string[]>(), imagePaths = new Map<string, string>();
  const bossIds = new Map<string, string>();
  const monsters = new Map(bundle.monsters);
  for (const roster of rosters) {
    const mapId = `map_${String(roster.map).padStart(4, '0')}`;
    const layout = layoutByMap[mapId], image = images[`../../../assets/monsters/${mapId}-v1.png`];
    if (!layout || !image || !bundle.manifest.maps.includes(mapId)) continue;
    // Only apply to the known shipped maps, never arbitrary editor previews.
    const room = bundle.rooms.find(r => r.mapId === mapId);
    if (!room) continue;
    const path = `${PREFIX}${mapId}.sheet.json`, imagePath = `${PREFIX}${mapId}.png`;
    imagePaths.set(imagePath, image);
    const tags = roster.monsters.flatMap((_, role) => {
      const start = role * 12;
      return [ ['idle',0,1,'pingpong'], ['move',2,5,'forward'], ['hit',6,7,'forward'], ['die',8,11,'forward'] ].map(([name,from,to,direction]) => ({ name:`${name}_${role}`, from:start+Number(from), to:start+Number(to), direction:String(direction) }));
    });
    const sheet = parseAsepriteSheet({ frames: layout.frames.map((rect, i) => {
      const role = ROLES[Math.floor(i / 12)]!, local = i % 12;
      return { filename:String(i), frame:rect, rotated:false, trimmed:true,
        sourceSize:{w:layout.canvas,h:layout.canvas}, spriteSourceSize:{x:Math.floor((layout.canvas-rect.w)/2),y:layout.canvas-rect.h,w:rect.w,h:rect.h},
        duration:local<2?role.idleMs:local<6?role.walkMs:local<8?80:role.dieMs };
    }), meta:{image:imagePath,size:{w:layout.width,h:layout.height},frameTags:tags} });
    const ids = roster.monsters.map((entry, role) => {
      const id = themedMonsterId(roster.map, role), profile = ROLES[role]!;
      // Mild per-map variation makes gait/size distinct even within the same ecological role.
      const variation = [0.94, 1, 1.06][(roster.map + role) % 3]!;
      const height = Math.round(profile.height * variation), width = Math.round(profile.width * variation);
      const baseline = bundle.monsters.get(room.lineup?.[role % Math.max(1, room.lineup.length)] ?? '')?.math;
      const math: MonsterMath = baseline ? { ...baseline, id } : { id, tier: role === 3 ? 'elite' : 'normal', multiplier: role === 3 ? [30,60] : role === 0 ? 2 : [3,10] };
      const def: MonsterDef = { schemaVersion:1, id, name:entry[0]!, sheet:path,
        tags:{idle:`idle_${role}`,move:`move_${role}`,hit:`hit_${role}`,die:`die_${role}`},
        hitbox:{x:-width/2,y:-height,w:width,h:height},labelOffset:{x:0,y:-height-7},mathId:id,
        behavior:{move:role===2?'fly':'ground',speed:Math.round(profile.speed*variation),idleSec:[...profile.idle],moveSec:[...profile.move],knockback:profile.knock,dieFadeSec:0.25},
        fx:{hit:'hit_spark',die:'dust',coinFrame:2,coinCount:role===3?8:role===0?2:4},showHpBar:role===3 };
      // The illustrations contain baked shading; scene lighting would crush their cave/night silhouettes.
      const asset: SheetAsset = {path,image:imagePath,sheet,presentation:{scale:height/layout.idleHeights[role]!,unlit:true}};
      monsters.set(id,{def,sheet:asset,math}); return id;
    });
    maps.set(mapId,ids);
    if (room.boss) {
      const original = bundle.monsters.get(room.boss.mobId), guardian = monsters.get(ids[3]!)!;
      if (original) {
        const id = `mob_${String(200 + roster.map).padStart(4, '0')}`;
        monsters.set(id, { ...guardian, math: original.math ? {...original.math,id} : undefined,
          def:{...guardian.def,id,mathId:id,name:`${guardian.def.name}・首領`,showHpBar:true,
            hitbox:{...guardian.def.hitbox,x:guardian.def.hitbox.x*1.25,y:guardian.def.hitbox.y*1.25,w:guardian.def.hitbox.w*1.25,h:guardian.def.hitbox.h*1.25},labelOffset:{x:0,y:guardian.def.labelOffset.y*1.25}},
          sheet:{...guardian.sheet,presentation:{...guardian.sheet.presentation!,scale:guardian.sheet.presentation!.scale*1.25}} });
        bossIds.set(mapId,id);
      }
    }
  }
  const retarget = (mapId: string, pool: {mobId:string;weight:number}[]) => {
    const ids = maps.get(mapId)!, room = bundle.rooms.find(r=>r.mapId===mapId)!;
    return pool.flatMap(entry => {
      const index = room.lineup?.indexOf(entry.mobId) ?? -1;
      // Split the old first species between small/large visual roles, retaining its total weight and math.
      return index === 0 ? [{mobId:ids[0]!,weight:entry.weight*3},{mobId:ids[3]!,weight:entry.weight}]
        : index > 0 && index < 3 ? [{mobId:ids[index]!,weight:entry.weight*4}] : [{...entry,weight:entry.weight*4}];
    });
  };
  const rooms = bundle.rooms.map(room => {
    const ids = maps.get(room.mapId); if (!ids) return room;
    return { ...room, lineup:ids,
      ...(room.boss && bossIds.has(room.mapId) ? {boss:{...room.boss,mobId:bossIds.get(room.mapId)!}} : {}),
      ...(room.wave ? {wave:{...room.wave,pool:retarget(room.mapId,room.wave.pool)}} : {}) };
  });
  return { ...bundle, monsters, rooms,
    source:{json:bundle.source.json.bind(bundle.source),imageUrl:async path=>imagePaths.get(path)??bundle.source.imageUrl(path)},
    async loadMap(id):Promise<MapDef> {
      const map = await bundle.loadMap(id), ids = maps.get(id); if (!ids) return map;
      let zones = map.spawnZones.map(zone=>({...zone,pool:retarget(id,zone.pool)}));
      const present = new Set(zones.flatMap(zone => zone.pool.map(entry => entry.mobId)));
      // Some shipped rooms omit a lineup species from every regular spawn zone.
      // Give that visual a share of an existing species, retaining the donor's math.
      // The original lineup variant remains available for waves with its original math.
      ids.forEach((visualId, role) => {
        if (present.has(visualId) || !zones.length) return;
        const donorId = zones[0]!.pool[0]?.mobId;
        const donor = donorId && monsters.get(donorId), visual = monsters.get(visualId);
        if (!donor || !visual) return;
        const alias = `mob_${String(300 + (Number(id.slice(4)) - 1) * 4 + role).padStart(4, '0')}`;
        monsters.set(alias, {...visual, def:{...visual.def,id:alias,mathId:alias}, math:donor.math?{...donor.math,id:alias}:undefined});
        zones = zones.map(zone => ({...zone,pool:zone.pool.flatMap(entry => entry.mobId === donorId
          ? [{mobId:donorId,weight:entry.weight*3},{mobId:alias,weight:entry.weight}]
          : [{...entry,weight:entry.weight*4}])}));
      });
      return { ...map, spawnZones:zones };
    } };
}
