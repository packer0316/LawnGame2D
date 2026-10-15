import type { WeaponKind } from './catalog';

/** 原畫均朝上。握持角度以垂直為零，不沿用飛行投射物的水平朝向。 */
export function weaponRig(kind: WeaponKind, pose: string, index: number, length: number): { angle: number; plane: 'front' | 'back'; sheathed?: boolean } {
  const t = Math.max(0, Math.min(1, index / Math.max(1, length - 1)));
  const sample = (keys: number[]) => {
    const p = t * (keys.length - 1), a = Math.floor(p), b = Math.min(keys.length - 1, a + 1);
    return keys[a]! + (keys[b]! - keys[a]!) * (p - a);
  };
  // 四類武器的佩帶方式不同：腰間劍鞘、手腕拳刃、手持杖與弓。
  if (['stand', 'run', 'jump', 'fall', 'land', 'prone', 'roll', 'ladder', 'rope'].includes(pose)) {
    if (kind === 'sword') return { angle: 135, plane: 'front', sheathed: true };
    if (kind === 'claw') return { angle: pose === 'run' ? sample([-55, -70, -40, -65, -55]) : -55, plane: 'front' };
    return { angle: pose === 'run' ? sample([0, -6, 0, 6, 0]) : 0, plane: 'back' };
  }
  if (kind === 'bow') return { angle: 0, plane: 'back' };
  if (kind === 'staff') return { angle: sample([0, -12, -18, -6, 0]), plane: t > .2 && t < .8 ? 'front' : 'back' };
  if (kind === 'claw') return { angle: sample([-55, -20, -90, -70, -55]), plane: 'front' };
  const keys = pose === 'swing2' ? [0, -150, -85, -25, 0] : pose === 'swing3' ? [0, 35, -85, -145, 0] : [0, 25, -80, -145, 0];
  return { angle: sample(keys), plane: t > .2 && t < .85 ? 'front' : 'back' };
}
