import * as Phaser from 'phaser';
import type {FxPoint,SkillFxContext} from './SkillFx';
import {graspKey} from './InfernalGraspArt';
import {graspAnchors,GRASP_TIMING as T} from './InfernalGraspTiming';
import {sfx} from '../audio/Sfx';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};

/** Bottom-ground summons, cut-in and crushes all sample the same paused gameplay clock. */
export class InfernalGrasp{
  elapsed=0;active=true;
  private objects=new Set<Phaser.GameObjects.GameObject>();
  private hands:{x:number;y:number;width:number;height:number;sprite:Phaser.GameObjects.Sprite;gate:Phaser.GameObjects.Sprite}[];
  private bursts:{sprite:Phaser.GameObjects.Sprite;born:number;life:number}[]=[];
  private shade:Phaser.GameObjects.Graphics;
  private overlay:Phaser.GameObjects.Graphics;
  private portrait:Phaser.GameObjects.Sprite;
  private startZoom:number;private bounded:boolean;private center:FxPoint;
  private lastHit=-Infinity;private final=false;
  constructor(private scene:Phaser.Scene,private ctx:SkillFxContext){
    const cam=scene.cameras.main;
    this.startZoom=cam.zoom;this.bounded=cam.useBounds;cam.useBounds=false;
    this.center={x:cam.worldView.centerX,y:cam.worldView.centerY};cam.stopFollow();
    this.shade=this.own(scene.add.graphics()).setDepth(50);
    this.overlay=this.own(scene.add.graphics()).setDepth(72);
    this.portrait=this.own(scene.add.sprite(0,0,graspKey('portrait'),0)).setDepth(74);
    this.hands=graspAnchors(ctx.bounds,ctx.rainTerrain??[]).map((p,i)=>({...p,
      sprite:this.own(scene.add.sprite(p.x,p.y,graspKey('hands'),0)).setOrigin(.5,1)
        .setDepth(54+i*.01).setDisplaySize(p.width,p.height).setFlipX(i%2===1).setVisible(false),
      gate:this.own(scene.add.sprite(p.x,p.y-3,graspKey('crush'),6)).setDepth(56)
        .setDisplaySize(p.width*.9,52).setVisible(false),
    }));this.render();
  }
  get count(){return this.objects.size;}
  private own<O extends Phaser.GameObjects.GameObject>(o:O):O{this.objects.add(o);o.once('destroy',()=>this.objects.delete(o));return o;}
  step(dt:number){
    if(!this.active)return;
    const before=this.elapsed;this.elapsed+=dt;
    for(let i=0;i<this.hands.length;i++){
      const at=T.rise+i*T.riseGap;
      if(before<at&&this.elapsed>=at)sfx.play('grasp:rise',{rate:.85+i*.035});
    }
    for(const [i,at]of T.hits.entries())if(before<at&&this.elapsed>=at)this.crush(i);
    if(this.elapsed>=T.end){this.destroy();return;}
    this.render();
  }
  private burst(p:FxPoint,size:number,life=340){
    const sprite=this.own(this.scene.add.sprite(p.x,p.y,graspKey('crush'),3))
      .setDepth(63).setDisplaySize(size,size);
    this.bursts.push({sprite,born:this.elapsed,life});
  }
  private crush(index:number){
    const last=index===T.hits.length-1;
    this.lastHit=this.elapsed;this.final=last;
    sfx.play(last?'grasp:finish':'grasp:crush',{rate:.88+index*.025});
    for(const [i,h]of this.hands.entries())if(last||index===6||i%6===index){
      this.burst({x:h.x,y:h.y-h.height*.73},last?310:230,last?490:350);
    }
  }
  contact(targets:FxPoint[],_index:number,last:boolean){
    // Cosmetic hand crushes still play on a miss; enemy bursts only follow accepted hits.
    for(const p of targets)this.burst(p,last?170:112,last?430:240);
    this.render();
  }
  private render(){
    const ms=this.elapsed,cam=this.scene.cameras.main,b=this.ctx.bounds;
    const reveal=ease((ms-750)/650),restore=ease((ms-4520)/430);
    const wide=Math.min(cam.width/(b.w+30),cam.height/(b.h+24));
    const zoom=this.startZoom+(wide-this.startZoom)*reveal;
    const hit=clamp(1-(ms-this.lastHit)/(this.final?220:90));
    cam.setZoom((zoom+(this.startZoom-zoom)*restore)*(1+(this.final?.025:.008)*hit));
    const mix=reveal*(1-restore);
    cam.centerOn(this.center.x+(b.x+b.w/2-this.center.x)*mix,this.center.y+(b.y+b.h/2-this.center.y)*mix);
    const w=cam.width/cam.zoom,h=cam.height/cam.zoom,cx=cam.scrollX+cam.width/2,cy=cam.scrollY+cam.height/2;
    const x=cx-w/2,y=cy-h/2,fade=clamp(ms/160)*clamp((T.end-ms)/400);
    this.shade.clear().fillStyle(0x10051d,(ms<950?.93:.73)*fade).fillRect(x-20,y-20,w+40,h+40);
    this.overlay.clear().fillStyle(0x200b36,.12*fade).fillRect(x,y,w,h);
    // Hide outside-map scenery while the camera reveals all tiers.
    this.overlay.fillStyle(0x08030d,fade);
    if(y<b.y)this.overlay.fillRect(x,y,w,b.y-y);
    if(y+h>b.y+b.h)this.overlay.fillRect(x,b.y+b.h,w,y+h-b.y-b.h);
    if(x<b.x)this.overlay.fillRect(x,y,b.x-x,h);
    if(x+w>b.x+b.w)this.overlay.fillRect(b.x+b.w,y,x+w-b.x-b.w,h);
    this.overlay.fillRect(x,y,w,h*.065).fillRect(x,y+h*.935,w,h*.065);
    if(hit>0)this.overlay.fillStyle(0xffd79b,(this.final?.13:.045)*hit).fillRect(x,y,w,h);
    // The borderless close-up returns briefly for the caster's clenched-fist command.
    const intro=ms<1120,command=ms>=2720&&ms<3140;
    const pAlpha=intro?clamp(ms/120)*clamp((1120-ms)/200):command?clamp((ms-2720)/80)*clamp((3140-ms)/90):0;
    const ph=intro?h*.88:h*.57,pw=ph*.75,px=intro?cx:cx-w*.32;
    const frame=intro?Math.min(4,Math.floor(ms/200)):Math.max(4,Math.min(7,4+Math.floor((ms-2720)/90)));
    this.portrait.setVisible(pAlpha>0).setFrame(frame).setPosition(px,cy).setDisplaySize(pw,ph).setAlpha(pAlpha);
    for(const [i,hand]of this.hands.entries()){
      const age=ms-T.rise-i*T.riseGap,rise=ease(age/T.riseLife);
      const sink=ease((ms-4540)/400),visible=age>=0&&sink<1;
      const beat=T.hits[i%6]!,closing=clamp((ms-(beat-150))/150);
      let frame=age<T.riseLife?Math.min(3,Math.floor(rise*4)):4+Math.floor((ms+i*65)/115)%4;
      if(closing>0)frame=8+Math.min(3,Math.floor(closing*4));
      if(ms>beat+230&&ms<T.hits[6]-100)frame=12+Math.min(2,Math.floor((ms-beat-230)/110));
      if(ms>=T.hits[6]-100)frame=11;
      if(ms>=4500)frame=12+Math.min(3,Math.floor((ms-4500)/110));
      const struggle=ms>T.struggle&&ms<beat-150?Math.sin((ms-T.struggle)/70+i)*3:0;
      const recoil=ms>=beat?Math.sin(clamp((ms-beat)/220)*Math.PI)*12:0;
      const exposed=rise*(1-sink);
      hand.sprite.setVisible(visible).setFrame(frame).setPosition(hand.x+struggle,hand.y+hand.height*(1-exposed)+recoil)
        .setAlpha(clamp(age/80)*clamp((T.end-ms)/230));
      // Clip the submerged portion in source coordinates, so the arm rises from the lowest floor.
      const f=hand.sprite.frame;
      hand.sprite.setCrop(0,0,f.realWidth,Math.max(0,f.realHeight*(exposed-recoil/hand.height)));
      hand.gate.setVisible(visible).setAlpha(clamp(age/180)*(1-sink)*(.5+.12*Math.sin(ms*.008+i)));
    }
    this.bursts=this.bursts.filter(t=>{
      const p=(ms-t.born)/t.life;
      if(p>=1){t.sprite.destroy();return false;}
      t.sprite.setFrame(3+Math.min(4,Math.floor(p*5))).setAlpha(1-p*.8);return true;
    });
  }
  destroy(){
    if(!this.active)return;this.active=false;
    for(const o of [...this.objects])o.destroy();this.bursts=[];
    this.scene.cameras.main.useBounds=this.bounded;
    if(this.scene.sys.isActive())this.ctx.restoreCamera?.();
  }
}
