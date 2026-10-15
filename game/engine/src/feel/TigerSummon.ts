import * as Phaser from 'phaser';
import type { SkillDef, Rect } from '@lawn/shared';
import type { SkillFxContext, FxPoint } from './SkillFx';
import { SkillVfxKit } from './SkillVfxKit';
import { atlasKey } from './SkillAtlas';
import { DEPTH } from '../map/MapView';
import { tigerRoute, tigerX, tigerFrame, tigerBiteX, tigerBiteRect, type TigerRoute } from './TigerRoute';

/** One solid animated tiger, driven by the same fixed clock as its moving bite hitboxes. */
export class TigerSummon {
  readonly route:TigerRoute;
  readonly sprite:Phaser.GameObjects.Sprite;
  elapsed=0;
  private trailAt=0;
  private trailCount=0;
  constructor(private scene:Phaser.Scene,private kit:SkillVfxKit,private ctx:SkillFxContext,skill:SkillDef){
    const floor=ctx.groundAt(ctx.x,ctx.y-8)??ctx.y;
    const size=Math.max(160,Math.min(360,(floor-ctx.view.y-14)/.76));
    this.route=tigerRoute(ctx.x,floor,ctx.view,ctx.bounds,skill.strikes.map(s=>s.atMs),size);
    this.sprite=kit.own(scene.add.sprite(tigerX(this.route,0),floor,atlasKey('tiger'),0))
      .setOrigin(.5,.82).setDepth(DEPTH.fx).setDisplaySize(size,size).setFlipX(this.route.direction===-1).setAlpha(1);
  }
  floorAt(x:number):number {
    const ground=this.ctx.groundAt(x,this.route.floorY-48);
    // Cross gaps as a spirit; never drop onto another floor or climb a different tier.
    return ground!==null&&Math.abs(ground-this.route.floorY)<=48?ground:this.route.floorY;
  }
  hitRect(index:number):Rect{return tigerBiteRect(this.route,index,this.floorAt(tigerBiteX(this.route,index)));}
  step(dt:number):void {
    if(!this.sprite.active)return;
    this.elapsed+=dt;
    if(this.elapsed>=this.route.endMs){this.destroy();return;}
    const x=tigerX(this.route,this.elapsed),y=this.floorAt(x),frame=tigerFrame(this.route,this.elapsed);
    const bite=this.route.strikes.some(t=>Math.abs(this.elapsed-t)<85);
    const fade=Math.min(1,this.elapsed/220,(this.route.endMs-this.elapsed)/220);
    this.sprite.setPosition(x,y+6).setFrame(frame).setAlpha(1);
    if(this.elapsed-this.trailAt<90||this.elapsed<100)return;
    this.trailAt=this.elapsed;
    const direction=this.route.direction;
    const size=this.route.size,scale=size/360;
    if(++this.trailCount%2===0){
      const ghost=this.kit.own(this.scene.add.sprite(x-direction*26,y+6,atlasKey('tiger'),frame))
        .setOrigin(.5,.82).setDepth(DEPTH.fx-1).setDisplaySize(size+6,size+6).setFlipX(direction===-1)
        .setTint(0x64cfff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.18*fade);
      this.scene.tweens.add({targets:ghost,x:ghost.x-direction*45,alpha:0,duration:300,onComplete:()=>ghost.destroy()});
      this.kit.smoke(x-direction*65,y,0x446781,.65);
    }
    this.bodyLightning(frame,scale,direction,bite);
    this.kit.glow(x,y-70*scale,0x258fff,210*scale,220,.2*fade);
    this.kit.burst(x-direction*110*scale,y-50*scale,0x77dfff,.55,4,direction===1?Math.PI:0);
    this.kit.trail(x-direction*70,y-12,0x9bedff,direction===1?0:Math.PI,false);
  }
  bite(targets:FxPoint[]):void {
    const dir=this.route.direction,x=this.sprite.x+dir*this.route.jawOffset,y=this.sprite.y-60*this.route.size/360;
    this.kit.glow(x,y,0xd3f5ff,155,220,.6);
    this.kit.burst(x,y,0xa8edff,1.2,15,dir===1?0:Math.PI);
    for(const t of targets.slice(0,8)){
      this.electricArc(t.x,t.y,[[-22,8],[-10,-14],[16,-5]],dir,.7,false);
      const jaw=this.kit.own(this.scene.add.graphics({x:t.x,y:t.y})).setDepth(DEPTH.fx+1).setBlendMode(Phaser.BlendModes.ADD);
      for(const side of [-1,1])for(let n=0;n<3;n++){
        const offset=(n-1)*13;
        jaw.fillStyle(0xaeefff,.8).fillTriangle(offset-4,side*24,offset+4,side*24,offset+dir*8,side*4);
      }
      this.scene.tweens.add({targets:jaw,alpha:0,scaleY:.45,duration:210,onComplete:()=>jaw.destroy()});
    }
  }
  /** Short discharges follow the silhouette; their anchors move with the tiger, not the world. */
  private bodyLightning(frame:number,scale:number,dir:number,bite:boolean):void {
    const raised=frame===4||frame===8||frame===10;
    const lift=raised?-24:0;
    const paths:number[][][]=[
      [[-100,-108+lift],[-58,-128+lift],[-18,-122+lift]],
      [[-8,-122+lift],[28,-132+lift],[63,-106+lift]],
      [[62,-100+lift],[72,-65+lift],[96,-28+lift]],
      [[-88,-93],[-104,-61],[-76,-28]],
      [[-106,-110],[-130,-136],[-142,-157]],
    ];
    const index=this.trailCount%paths.length;
    this.electricArc(this.sprite.x,this.sprite.y,paths[index]!,dir,scale,true);
    if(bite||this.trailCount%3===0)this.electricArc(this.sprite.x,this.sprite.y,paths[(index+2)%paths.length]!,dir,scale,true);
  }

  private electricArc(x:number,y:number,path:number[][],dir:number,scale:number,attached:boolean):void {
    const g=this.kit.own(this.scene.add.graphics({x,y})).setDepth(DEPTH.fx+1).setBlendMode(Phaser.BlendModes.ADD);
    const [a,b,c]=path as [number[],number[],number[]];
    const points=Array.from({length:11},(_,i)=>{
      const t=i/10,u=1-t,jitter=(Math.random()-.5)*9*Math.sin(t*Math.PI);
      return {x:(u*u*a[0]!+2*u*t*b[0]!+t*t*c[0]!+jitter*.4)*dir*scale,
        y:(u*u*a[1]!+2*u*t*b[1]!+t*t*c[1]!+jitter)*scale};
    });
    for(const [width,color,alpha]of [[5,0x207cff,.12],[1.6,0x55cfff,.7],[.65,0xf1fdff,.92]]){
      g.lineStyle(width!*Math.max(.7,scale),color!,alpha!).beginPath().moveTo(points[0]!.x,points[0]!.y);
      for(const p of points.slice(1))g.lineTo(p.x,p.y);
      g.strokePath();
    }
    const p=points[5]!;
    g.lineStyle(.7,0xa2e9ff,.65).beginPath().moveTo(p.x,p.y)
      .lineTo(p.x-7*dir*scale,p.y-8*scale).lineTo(p.x-5*dir*scale,p.y-17*scale).strokePath();
    this.scene.tweens.add({targets:g,alpha:0,duration:80+Math.random()*85,
      onUpdate:()=>{if(attached&&this.sprite.active)g.setPosition(this.sprite.x,this.sprite.y);},
      onComplete:()=>g.destroy()});
  }
  destroy():void{this.sprite.destroy();}
}
