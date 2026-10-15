import * as Phaser from 'phaser';
import type {FxPoint,SkillFxContext} from './SkillFx';
import {warriorBladeKey} from './WarriorBladeArt';
import {DEPTH} from '../map/MapView';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
// A broad cutting plane, an inclined upper orbit, and a quicker inner curl.
// Independent phases give depth without multiplying layers on each damage beat.
const SPIN_RINGS=[
  {size:1,height:.82,tilt:-.04,y:3,opacity:.92,frameMs:30,phase:0,delay:0},
  {size:.92,height:.65,tilt:-.23,y:-15,opacity:.66,frameMs:25,phase:5,delay:25},
  {size:.72,height:.95,tilt:.24,y:14,opacity:.76,frameMs:21,phase:10,delay:50},
] as const;
interface MoonBlade{
  sprite:Phaser.GameObjects.Sprite;ctx:SkillFxContext;dir:1|-1;
  age:number;start:number;end:number;duration:number;
  holdMs:number;recoverMs:number;contactCooldown:number;hit:Set<string>;
}

/** One continuous spin and one outward pair per cast, sampled on the gameplay clock. */
export class WarriorBladeEffects{
  private spin:{ctx:SkillFxContext;age:number;halves:Phaser.GameObjects.Sprite[]}|null=null;
  private waves:MoonBlade[]=[];
  private sparks:{graphic:Phaser.GameObjects.Graphics;age:number}[]=[];
  private holyIssued=false;
  constructor(private scene:Phaser.Scene,private onMoonImpact:()=>void=()=>{}){}
  get count():number{return (this.spin?.halves.length??0)+this.waves.length+this.sparks.length;}
  begin(skillId:string):void{
    if(skillId==='skill_0004'){this.spin?.halves.forEach(s=>s.destroy());this.spin=null;}
    if(skillId==='skill_0040')this.clearHoly();
  }
  whirl(ctx:SkillFxContext):void{
    if(this.spin)return; // Later strike cues are damage beats, never additional slash layers.
    const diameter=(ctx.area?.w??260)+16;
    const halves=SPIN_RINGS.flatMap((ring,index)=>[-1,1].map(side=>
      this.scene.add.sprite(ctx.x,ctx.y-26,warriorBladeKey('whirl'),0)
        .setDepth(DEPTH.player+side+index*.01)
        .setDisplaySize(diameter*ring.size,diameter*ring.size*ring.height)
        .setRotation(ring.tilt*ctx.facing).setFlipX(ctx.facing===-1)));
    this.spin={ctx,age:0,halves};this.renderSpin();
  }
  holy(ctx:SkillFxContext):void{
    if(this.holyIssued)return;
    this.holyIssued=true;
    const size=240,gap=24;
    for(const dir of [-1,1] as const){
      // Reserve the entire rotating square's diagonal, including at the first frame.
      const start=ctx.x+dir*(size/Math.SQRT2+gap);
      const end=dir===1?ctx.bounds.x+ctx.bounds.w+size:ctx.bounds.x-size;
      const sprite=this.scene.add.sprite(start,ctx.y-110,warriorBladeKey('holy'),0)
        .setDepth(DEPTH.fx).setDisplaySize(size,size).setFlipX(dir===-1).setAlpha(0);
      this.waves.push({sprite,ctx,dir,age:0,start,end,
        duration:Math.max(300,Math.abs(end-start)/Math.max(1,ctx.bounds.w)*1450),
        holdMs:0,recoverMs:0,contactCooldown:0,hit:new Set()});
    }
  }
  step(dt:number):void{
    if(this.spin){
      this.spin.age+=dt;
      if(this.spin.age>=500){this.spin.halves.forEach(s=>s.destroy());this.spin=null;}
      else this.renderSpin();
    }
    this.sparks=this.sparks.filter(s=>{
      s.age+=dt;
      if(s.age>=150){s.graphic.destroy();return false;}
      s.graphic.setAlpha(1-s.age/150).setScale(1+s.age/300);return true;
    });
    this.waves=this.waves.filter(w=>{
      w.contactCooldown=Math.max(0,w.contactCooldown-dt);
      const held=Math.min(dt,w.holdMs);w.holdMs-=held;
      const moving=dt-held;
      const speed=w.recoverMs>0?1-.6*w.recoverMs/100:1;
      w.recoverMs=Math.max(0,w.recoverMs-moving);
      const previous=w.age;w.age+=moving*speed;
      const xAt=(age:number)=>w.start+(w.end-w.start)*clamp(age/w.duration);
      // Sweep at most 24 px per sample, so low FPS cannot skip a small monster.
      if(moving>0&&w.contactCooldown===0&&w.age>65){
        const steps=Math.max(1,Math.ceil(Math.abs(xAt(w.age)-xAt(previous))/24));
        for(let i=1;i<=steps;i++){
          const age=previous+(w.age-previous)*i/steps;
          const contacts=(w.ctx.targetsAt?.(xAt(age),w.sprite.y,96)??[])
            .filter(t=>!w.hit.has(this.targetKey(t)));
          if(!contacts.length)continue;
          for(const t of contacts)w.hit.add(this.targetKey(t));
          w.age=age;w.holdMs=55;w.recoverMs=100;w.contactCooldown=180;
          for(const t of contacts.slice(0,4))this.moonSpark(t,w.dir);
          this.onMoonImpact();break;
        }
      }
      if(w.age>=w.duration){w.sprite.destroy();return false;}
      // Eight shimmer frames preserve the broad circular crescent silhouette throughout flight.
      w.sprite.setFrame(Math.floor(w.age/55)%8).setX(xAt(w.age))
        .setRotation(w.dir*(w.age/520*Math.PI*2-.18))
        .setAlpha(clamp(w.age/70)*clamp((w.duration-w.age)/150)*.94);
      return true;
    });
  }
  private targetKey(t:FxPoint):string{return t.id??`${Math.round(t.x/32)}:${Math.round(t.y/32)}`;}
  private moonSpark(t:FxPoint,dir:1|-1):void{
    const g=this.scene.add.graphics().setPosition(t.x,t.y).setDepth(DEPTH.fx+1).setRotation(dir*-.35);
    // A compact cutting flash and three chips; no extra crescent or lingering trail.
    g.fillStyle(0xffcf72,.8).fillTriangle(-32,0,26,-7,12,7);
    g.fillStyle(0xfffbed,1).fillTriangle(-24,0,24,-2,10,3);
    for(const [x,y]of [[-13,-18],[21,15],[7,-24]]){
      g.fillStyle(0xffdf9c,.9).fillTriangle(x!,y!,x!+5,y!-5,x!+2,y!+3);
    }
    this.sparks.push({graphic:g,age:0});
  }
  private renderSpin():void{
    const spin=this.spin!,point=spin.ctx.playerAt?.()??{x:spin.ctx.x,y:spin.ctx.y-26};
    for(const [i,s]of spin.halves.entries()){
      const ring=SPIN_RINGS[Math.floor(i/2)]!,age=spin.age-ring.delay;
      const frame=(Math.floor(Math.max(0,age)/ring.frameMs)+ring.phase)%16;
      const alpha=age<0?0:clamp((age+20)/65)*clamp((500-spin.age)/(90+ring.delay));
      // A small vertical drift suggests a rising vortex while each cutting plane stays legible.
      const drift=Math.sin(Math.max(0,age)/500*Math.PI)*3;
      s.setFrame(frame).setPosition(point.x,point.y+ring.y-drift).setAlpha(alpha*ring.opacity);
      const {realWidth:w,realHeight:h}=s.frame,half=Math.floor(h/2);
      // Each ring has disjoint far/near halves, all far halves stay behind the hero.
      s.setCrop(0,i%2===0?0:half,w,i%2===0?half:h-half);
    }
  }
  clear():void{
    this.spin?.halves.forEach(s=>s.destroy());this.spin=null;
    this.clearHoly();
  }
  private clearHoly():void{
    this.waves.forEach(w=>w.sprite.destroy());this.waves=[];this.holyIssued=false;
    this.sparks.forEach(s=>s.graphic.destroy());this.sparks=[];
  }
}
