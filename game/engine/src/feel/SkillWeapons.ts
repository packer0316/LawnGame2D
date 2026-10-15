import * as Phaser from 'phaser';
import type { SkillDef } from '@lawn/shared';
import { DEPTH } from '../map/MapView';

/** All weapon images point left; direction is centralized so texture and travel agree. */
export function orientSkillWeapon(sprite:Phaser.GameObjects.Sprite,angle:number):void {
  if(sprite.texture.key.startsWith('skill-assassin-'))return;
  sprite.setFlipX(Math.cos(angle)>=0).setRotation(Math.cos(angle)>=0?angle:angle-Math.PI);
}

export type SkillWeaponKind='arrow'|'fireArrow'|'fuma'|'crescent'|'glaive'|'split';
export const bladeSpinMs=(kind:SkillWeaponKind):number=>kind==='crescent'?160:kind==='glaive'?240:220;

export function createSkillWeapon(scene:Phaser.Scene,kind:SkillWeaponKind,x:number,y:number,size:number):Phaser.GameObjects.Sprite {
  const rotating=kind!=='arrow'&&kind!=='fireArrow';
  const key=rotating?'skill-assassin-fourblade':'skill-arrows';
  const frame=kind==='glaive'?2:kind==='split'?3:kind==='fireArrow'||kind==='crescent'?1:0;
  const sprite=scene.add.sprite(x,y,key,frame).setDepth(DEPTH.fx);
  sprite.setDisplaySize(size,rotating?size:size*.25);
  if(rotating){
    scene.tweens.add({targets:sprite,angle:360,duration:bladeSpinMs(kind),repeat:-1});
    sprite.once(Phaser.GameObjects.Events.DESTROY,()=>scene.tweens.killTweensOf(sprite));
  }
  return sprite;
}

export function createClassProjectile(scene:Phaser.Scene,skill:SkillDef,x:number,y:number):Phaser.GameObjects.Sprite|null {
  if(skill.classId==='archer')return createSkillWeapon(scene,skill.projectile?.explode?'fireArrow':'arrow',x,y,skill.kind==='basic'?112:skill.projectile?.explode?176:144);
  if(skill.classId==='assassin')return createSkillWeapon(scene,'fuma',x,y,skill.kind==='basic'?48:80);
  return null;
}

/** The blade atlas has a convex LEFT edge, unlike procedural crescents. */
export const bladeFlipX=(facing:1|-1):boolean=>facing===1;
