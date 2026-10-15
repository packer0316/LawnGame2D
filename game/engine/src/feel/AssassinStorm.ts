import * as Phaser from 'phaser';
import type { SkillDef } from '@lawn/shared';
import type { FxPoint, SkillFxContext } from './SkillFx';
import type { SkillVfxKit } from './SkillVfxKit';
import { createSkillWeapon } from './SkillWeapons';
import { STORM_ORBIT, stormBladePose, stormLaunchMs,stepStormFlight,type StormFlight } from './AssassinOrbit';

type Emit=(name:'razor',x:number,y:number,size:number)=>Phaser.GameObjects.Sprite;

/** A single evolving formation. Damage beats never restart the throw or replace its blades. */
export class AssassinStorm {
  readonly blades:Phaser.GameObjects.Sprite[];
  elapsed=0;
  private trailAt:number[]=Array(6).fill(0);
  private launched=new Set<number>();
  private readonly finish:number;
  private center:FxPoint;
  private ended=false;
  private flights=new Map<number,{state:StormFlight;target?:FxPoint;hitAt?:number}>();

  constructor(private scene:Phaser.Scene,private kit:SkillVfxKit,private ctx:SkillFxContext,skill:SkillDef,private emit:Emit,private hit:(point:FxPoint)=>void){
    this.finish=skill.strikes.at(-1)!.atMs;
    this.center={x:ctx.x+ctx.facing*30,y:ctx.y-68};
    this.blades=Array.from({length:6},(_,i)=>kit.own(createSkillWeapon(scene,'glaive',this.center.x,this.center.y,72+i%2*12)).setAlpha(0));
    for(const blade of this.blades)this.scene.tweens.killTweensOf(blade);
    kit.charge(ctx.x,ctx.y,0x8ba9ff,350);
  }
  get active():boolean{return !this.ended;}

  step(dt:number):void {
    if(this.ended)return;
    this.elapsed+=dt;
    if(this.elapsed>=Math.max(this.finish+300,stormLaunchMs(STORM_ORBIT.count-1)+1200)){this.destroy();return;}
    for(const [i,blade]of this.blades.entries()){
      if(!blade.active)continue;
      const pose=stormBladePose(i,this.elapsed,this.ctx.facing);
      blade.setRotation(this.elapsed/210*Math.PI*2+i*Math.PI/3);
      if(!pose.flying){
        const ready=Math.max(0,1-(stormLaunchMs(i)-this.elapsed)/100);
        blade.setPosition(this.center.x+pose.x,this.center.y+pose.y).setAlpha(pose.alpha*(.65+ready*.35));
        blade.setDisplaySize((72+i%2*12)*(1+ready*.2),(72+i%2*12)*(1+ready*.2));
        continue;
      }
      if(!this.launched.has(i)){
        this.launched.add(i);
        const launch=stormBladePose(i,stormLaunchMs(i),this.ctx.facing);
        this.flights.set(i,{state:{x:this.center.x+launch.x,y:this.center.y+launch.y,angle:launch.angle,age:0,speed:.32,hit:false}});
        blade.setPosition(this.center.x+launch.x,this.center.y+launch.y).setAlpha(1);
        const wake=this.emit('razor',blade.x,blade.y,160).setRotation(pose.angle).setAlpha(.65);
        this.scene.tweens.add({targets:wake,x:wake.x-Math.cos(pose.angle)*30,y:wake.y-Math.sin(pose.angle)*30,duration:440});
        this.kit.glow(blade.x,blade.y,0x97e9ff,75,160,.35);
        this.kit.burst(blade.x,blade.y,0xb5f7ff,.55,8,pose.angle+Math.PI);
      }
      const flight=this.flights.get(i)!;
      const candidates=this.ctx.targetsAt?.(this.center.x,this.center.y,Math.max(450,this.ctx.reach))??[];
      const live=flight.target?.id?candidates.find(t=>t.id===flight.target!.id):undefined;
      // Keep a living target; if it dies, reacquire a nearby one instead of chasing stale coordinates.
      flight.target=live??(candidates.length?candidates.sort((a,b)=>Math.hypot(a.x-blade.x,a.y-blade.y)-Math.hypot(b.x-blade.x,b.y-blade.y))[i%Math.min(3,candidates.length)]:undefined);
      const wasHit=flight.state.hit;
      flight.state=stepStormFlight(flight.state,dt,flight.target);
      if(!wasHit&&flight.state.hit&&flight.target){
        flight.hitAt=flight.state.age;this.hit(flight.target);
        this.kit.burst(flight.target.x,flight.target.y,0xc5faff,.9,12,flight.state.angle);
      }
      const fade=flight.hitAt===undefined?Math.min(1,(1200-flight.state.age)/180):1-(flight.state.age-flight.hitAt)/160;
      if(fade<=0){blade.destroy();continue;}
      blade.setPosition(flight.state.x,flight.state.y).setAlpha(fade);
      if(this.elapsed-this.trailAt[i]!<45)continue;
      this.trailAt[i]=this.elapsed;
      const ghost=this.kit.own(this.scene.add.sprite(blade.x,blade.y,blade.texture.key,blade.frame.name))
        .setDepth(blade.depth-1).setDisplaySize(blade.displayWidth,blade.displayHeight).setRotation(blade.rotation).setAlpha(.2*fade);
      this.scene.tweens.add({targets:ghost,alpha:0,duration:150,onComplete:()=>ghost.destroy()});
      this.kit.trail(blade.x,blade.y,0xb8f4ff,flight.state.angle,true);
    }
  }

  strike(targets:FxPoint[]):void {
    if(this.ended)return;
    for(const t of targets.slice(0,6))this.hit(t);
  }
  destroy():void{this.ended=true;for(const blade of this.blades)blade.destroy();this.flights.clear();}
}
