/** 只同步景點房名，保留房間押注、怪物、Boss 與連接設定。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import landmarks from '../../../../game/assets/landmarks/catalog.json';
const path = fileURLToPath(new URL('../../../../content/rooms/rooms.json', import.meta.url));
const rooms = JSON.parse(readFileSync(path, 'utf8'));
for (const room of rooms.rooms) {
  const scene = landmarks.scenes.find(s => s.roomIds.includes(room.id));
  if (scene) room.name = scene.name;
}
writeFileSync(path, JSON.stringify(rooms, null, 2)+'\n');
console.log('已同步六個景點房名，保留房間數值。');
