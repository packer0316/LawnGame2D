import * as Phaser from 'phaser';
import { DEPTH } from '../map/MapView';
import { VFX_BUDGET } from './SkillPresentation';

/** 共用柔光貼圖與有上限的瞬態物件。核心、色暈、碎光與煙分層，避免全畫面白色遮罩。 */
export class SkillVfxKit {
  private objects = new Set<Phaser.GameObjects.GameObject>();
  private lastVeil = -Infinity;
  constructor(private scene: Phaser.Scene) {
    for(const kind of ['halo','spark','smoke'] as const) {
      const key=`skill-v2-${kind}`;
      if(scene.textures.exists(key))continue;
      const tex=scene.textures.createCanvas(key,128,128)!;
      const c=tex.context;
      const gradient=c.createRadialGradient(64,64,0,64,64,64);
      gradient.addColorStop(0,kind==='smoke'?'rgba(255,255,255,.22)':'rgba(255,255,255,1)');
      gradient.addColorStop(kind==='spark'?0.09:0.18,`rgba(255,255,255,${kind==='smoke'?'.18':'.65'})`);
      gradient.addColorStop(0.48,`rgba(255,255,255,${kind==='smoke'?'.12':'.16'})`);
      gradient.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=gradient;c.fillRect(0,0,128,128);tex.refresh();
    }
  }
  get count(): number { return this.objects.size; }
  own<T extends Phaser.GameObjects.GameObject>(o:T):T {
    this.objects.add(o);
    o.once(Phaser.GameObjects.Events.DESTROY,()=>{this.scene.tweens.killTweensOf(o);this.objects.delete(o);});
    return o;
  }
  private image(kind:string,x:number,y:number,color:number,width:number,height=width,add=true) {
    const i=this.own(this.scene.add.image(x,y,`skill-v2-${kind}`)).setDepth(DEPTH.fx-1).setTint(color).setDisplaySize(width,height);
    if(add)i.setBlendMode(Phaser.BlendModes.ADD);
    return i;
  }
  glow(x:number,y:number,color:number,size:number,ms=250,alpha=0.7):void {
    if(this.count>=VFX_BUDGET.particles)return;
    const i=this.image('halo',x,y,color,size).setAlpha(alpha);
    this.scene.tweens.add({targets:i,alpha:0,scaleX:i.scaleX*1.5,scaleY:i.scaleY*1.5,duration:ms,ease:'Cubic.Out',onComplete:()=>i.destroy()});
  }
  /** 細長火星以不同速度散開；旋轉朝向軌跡，尾部逐漸收束。 */
  burst(x:number,y:number,color:number,power=1,count=14,angle?:number):void {
    for(let n=0;n<count&&this.count<VFX_BUDGET.particles;n++) {
      const a=angle===undefined?n/count*Math.PI*2+Math.random()*.4:angle+(Math.random()-.5)*1.5;
      const distance=(24+Math.random()*68)*power;
      const p=this.image('spark',x,y,n%4===0?0xffffff:color,14+Math.random()*22,2+Math.random()*3).setRotation(a);
      const sx=p.scaleX;
      this.scene.tweens.add({targets:p,x:x+Math.cos(a)*distance,y:y+Math.sin(a)*distance+12*power,alpha:0,scaleX:sx*.1,scaleY:0,duration:200+Math.random()*230,ease:'Cubic.Out',onComplete:()=>p.destroy()});
    }
    this.glow(x,y,color,85*power,180,0.6);
  }
  smoke(x:number,y:number,color:number,power=1):void {
    for(let n=0;n<5&&this.count<VFX_BUDGET.particles;n++) {
      const p=this.image('smoke',x+(n-2)*14,y,color,38*power,30*power,false).setAlpha(.7);
      this.scene.tweens.add({targets:p,x:p.x+(n-2)*28*power,y:y-20-Math.random()*35,scaleX:p.scaleX*2,scaleY:p.scaleY*1.7,alpha:0,duration:500+Math.random()*240,ease:'Sine.Out',onComplete:()=>p.destroy()});
    }
  }
  /** 命中星芒：暗色短輪廓、色光和極細白芯；60ms 尖峰後迅速收掉。 */
  impact(x:number,y:number,color:number,power=1):void {
    this.burst(x,y,color,power,Math.round(10+power*5));
    const g=this.own(this.scene.add.graphics({x,y})).setDepth(DEPTH.fx+1);
    const r=24*power;
    for(const [radius,alpha,tint] of [[r*1.25,.8,0x152137],[r,.9,color],[r*.78,1,0xffffff]]) {
      g.fillStyle(tint!,alpha!);
      g.fillPoints(Array.from({length:16},(_,i)=>{
        const a=i*Math.PI/8, rr=i%2?radius!*.07:radius!*(i%4?0.45:1);
        return new Phaser.Math.Vector2(Math.cos(a)*rr,Math.sin(a)*rr);
      }),true);
    }
    g.setRotation(Math.random()*.7);
    this.scene.tweens.add({targets:g,scale:1.35,alpha:0,duration:140,ease:'Expo.Out',onComplete:()=>g.destroy()});
  }
  charge(x:number,y:number,color:number,ms:number,large=false):void {
    if(ms<80)return;
    const radius=large?100:46;
    const ring=this.own(this.scene.add.graphics({x,y:y-3})).setDepth(DEPTH.player-2);
    ring.lineStyle(1,color,.7).strokeCircle(0,0,radius).strokeCircle(0,0,radius*.8);
    for(let n=0;n<12;n++) {
      const a=n*Math.PI/6;
      ring.lineBetween(Math.cos(a)*radius*.86,Math.sin(a)*radius*.86,Math.cos(a)*radius*.98,Math.sin(a)*radius*.98);
    }
    ring.setScale(.7,.23).setAlpha(0);
    this.scene.tweens.add({targets:ring,alpha:.85,scaleX:1,scaleY:.34,angle:20,duration:ms*.65,ease:'Cubic.Out'});
    this.scene.tweens.add({targets:ring,alpha:0,duration:100,delay:Math.max(0,ms-80),onComplete:()=>ring.destroy()});
    for(let n=0;n<(large?24:10)&&this.count<VFX_BUDGET.particles;n++) {
      const a=n*2.39996, r=radius*(.7+Math.random()*.6);
      const p=this.image('spark',x+Math.cos(a)*r,y-28+Math.sin(a)*r*.65,color,12,3).setRotation(a).setAlpha(0);
      this.scene.tweens.add({targets:p,x,y:y-28,alpha:.9,scaleX:0,scaleY:0,delay:n*ms/(large?40:20),duration:ms*.48,ease:'Cubic.In',onComplete:()=>p.destroy()});
    }
    const core=this.image('halo',x,y-28,color,large?100:52).setAlpha(0);
    this.scene.tweens.add({targets:core,alpha:large?.6:.35,duration:ms*.8,ease:'Quad.In',yoyo:true,hold:0,onComplete:()=>core.destroy()});
  }
  /** 低透明度暗場聚焦，保留角色與地形；HUD 在 canvas 外不受影響。 */
  veil(color:number,ms=360,strength=.18):void {
    if(this.scene.time.now-this.lastVeil<240)return;
    this.lastVeil=this.scene.time.now;
    const g=this.own(this.scene.add.graphics()).setScrollFactor(0).setDepth(DEPTH.player-2);
    g.fillStyle(color,strength).fillRect(-10000,-10000,20000,20000);
    this.scene.tweens.add({targets:g,alpha:0,delay:Math.min(90,ms*.2),duration:ms,ease:'Sine.Out',onComplete:()=>g.destroy()});
  }
  clear():void {
    for(const o of [...this.objects])o.destroy();
    this.objects.clear();this.lastVeil=-Infinity;
  }
}
