import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLandmarks } from './landmarks';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const flag=process.argv.indexOf('--out');
const out=flag>=0?path.resolve(process.argv[flag+1]!):path.join(root,'content');
writeLandmarks(out);
console.log(`已更新六套景點背景、地形與主題：${out}`);
