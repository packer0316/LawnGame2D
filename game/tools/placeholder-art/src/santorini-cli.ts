import path from 'node:path';
import {fileURLToPath} from 'node:url';
import catalog from '../../../assets/landmarks/catalog.json';
import {landmarkTiles} from './landmarks';
import {writePng} from './sheet';
import {normalMap} from './world';

// Game-owned visual override: no map, collision or editor-owned content is rewritten.
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../assets/landmarks');
const tiles=landmarkTiles(catalog.scenes.find(s=>s.id==='gr_santorini')!);
writePng(path.join(out,'gr_santorini-tiles-v2.png'),tiles);
writePng(path.join(out,'gr_santorini-tiles-v2_n.png'),normalMap(tiles,1.1,16));
console.log('Santorini limestone tiles and normals saved to game/assets/landmarks');
