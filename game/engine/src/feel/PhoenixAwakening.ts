import * as Phaser from 'phaser';
import type {FxPoint,SkillFxContext} from './SkillFx';
import {phoenixKey} from './PhoenixAwakeningArt';
import {PHOENIX_TIMING as T,phoenixClamp as clamp,phoenixCorner,phoenixFlight,phoenixFlightMs} from './PhoenixAwakeningTiming';
import {sfx} from '../audio/Sfx';
const ease=(t:number)=>{t=clamp(t);return t*t*(3-2*t);};
type Feather={sprite:Phaser.GameObjects.Sprite;from:FxPoint;to:FxPoint;born:number;life:number;id?:string;bend:number;size:number};

/** All animation and damage use the paused fixed game clock, never wall-clock tweens. */
export class PhoenixAwakening{
  elapsed=0;active=true;
  private objects=new Set<Phaser.GameObjects.GameObject>();
  private shade:Phaser.GameObjects.Graphics;
  private overlay:Phaser.GameObjects.Graphics;
  private portrait:Phaser.GameObjects.Sprite;
  private bird:Phaser.GameObjects.Sprite;
  private caster:Phaser.GameObjects.Sprite;
  private feathers:Feather[]=[];
  private bursts:{sprite:Phaser.GameObjects.Sprite;born:number;life:number}[]=[];
  private corner:ReturnType<typeof phoenixCorner>;
  private startZoom:number;private bounded:boolean;private center:FxPoint;
  private lastHit=-Infinity;private final=false;private hiding=false;
  private planned=new Map<number,string[]>();private cursor=0;
  constructor(private scene:Phaser.Scene,private ctx:SkillFxContext){
    const cam=scene.cameras.main;
    this.startZoom=cam.zoom;this.bounded=cam.useBounds;cam.useBounds=false;cam.stopFollow();
    this.center={x:cam.worldView.centerX,y:cam.worldView.centerY};
    this.corner=phoenixCorner(ctx.bounds,ctx.x);
    this.shade=this.own(scene.add.graphics()).setDepth(50);
    this.overlay=this.own(scene.add.graphics()).setDepth(72);
    this.portrait=this.sprite('portrait',74);
    this.bird=this.sprite('phoenix',56);
    this.caster=this.sprite('caster',57).setOrigin(.5,.98).setDisplaySize(112,112).setPosition(ctx.x,ctx.y);
    this.render();
  }
  get count(){return this.objects.size;}
  private own<O extends Phaser.GameObjects.GameObject>(o:O):O{this.objects.add(o);o.once('destroy',()=>this.objects.delete(o));return o;}
  private sprite(name:Parameters<typeof phoenixKey>[0],depth:number){return this.own(this.scene.add.sprite(0,0,phoenixKey(name),0)).setDepth(depth).setVisible(false);}
  private targets(){const b=this.ctx.bounds;return this.ctx.targetsAt?.(b.x+b.w/2,b.y+b.h/2,Math.hypot(b.w,b.h))??[];}
  step(dt:number){
    if(!this.active)return;
    const before=this.elapsed;this.elapsed+=dt;
    for(const [at,name]of [[T.eye,'eye'],[T.launch,'launch'],[T.entrance,'arrive']] as const)
      if(before<at&&this.elapsed>=at)sfx.play(`phoenix:${name}`);
    for(const [i,at]of T.hits.entries()){
      const born=at-phoenixFlightMs(i);
      if(before<born&&this.elapsed>=born)this.emit(i,born);
    }
    if(msBeat(before)!==msBeat(this.elapsed)&&this.elapsed>=2350&&this.elapsed<5250)sfx.play('phoenix:wing',{gain:-5,rate:1.1});
    if(this.elapsed>=T.end){this.destroy();return;}
    this.render();
  }
  targetIds(index:number){return this.planned.get(index)??[];}
  private emit(index:number,at:number){
    if(index%4===0)sfx.play('phoenix:feather',{rate:1+(index%3)*.05});
    const b=this.ctx.bounds,c=this.corner,live=this.targets().sort((a,b)=>(a.id??'').localeCompare(b.id??''));
    const points:FxPoint[]=[];
    for(let i=0;i<Math.min(3,live.length);i++)points.push(live[(this.cursor+i)%live.length]!);
    this.cursor+=3;this.planned.set(index,points.flatMap(p=>p.id?[p.id]:[]));
    // Additional off-axis feathers fill the sky without extra damage or hit flashes.
    points.push({x:b.x+b.w*((index*.618)%1),y:b.y+b.h*(.36+(index%6)*.09)});
    points.forEach((to,i)=>{
      const size=index>50?96:64+(index+i)%3*10;
      const sprite=this.sprite('effects',60).setVisible(true).setDisplaySize(size,size).setAlpha(to.id?1:.62);
      const span=Math.min(b.w*.34,b.h*.69),side=(index+i)%2?1:-1;
      const from={x:c.x+side*(span*.34+(index%3)*9),y:c.y+span*.12+(i%3)*10};
      this.feathers.push({sprite,from,to:{...to},id:to.id,born:at,life:phoenixFlightMs(index),bend:75+(index*31+i*53)%135,size});
    });
  }
  contact(targets:FxPoint[],index:number,last:boolean){
    this.lastHit=this.elapsed;this.final=last;
    if(last||index%2===0)sfx.play(last?'phoenix:finish':'phoenix:hit',{rate:1+(index%5)*.025,gain:last?0:-3});
    for(const p of targets){
      const sprite=this.sprite('effects',63).setVisible(true).setPosition(p.x,p.y).setFrame(4).setDisplaySize(last?172:100,last?172:100);
      this.bursts.push({sprite,born:this.elapsed,life:last?540:260});
    }
    this.render();
  }
  private render(){
    const ms=this.elapsed,cam=this.scene.cameras.main,b=this.ctx.bounds;
    const reveal=ease((ms-950)/900),restore=ease((ms-5540)/410),mix=reveal*(1-restore);
    const wide=Math.min(cam.width/(b.w+30),cam.height/(b.h+24));
    cam.setZoom(this.startZoom+(wide-this.startZoom)*mix);
    cam.centerOn(this.center.x+(b.x+b.w/2-this.center.x)*mix,this.center.y+(b.y+b.h/2-this.center.y)*mix);
    const w=cam.width/cam.zoom,h=cam.height/cam.zoom,cx=cam.scrollX+cam.width/2,cy=cam.scrollY+cam.height/2,x=cx-w/2,y=cy-h/2;
    const fade=clamp(ms/150)*clamp((T.end-ms)/420),hit=clamp(1-(ms-this.lastHit)/(this.final?210:90));
    this.shade.clear().fillStyle(0x10091f,(ms<1000?.91:.66)*fade).fillRect(x-20,y-20,w+40,h+40);
    this.overlay.clear().fillStyle(0x090612,fade).fillRect(x,y,w,h*.055).fillRect(x,y+h*.945,w,h*.055);
    if(hit>0)this.overlay.fillStyle(0xead5ff,(this.final?.12:.008)*hit).fillRect(x,y,w,h);
    const intro=ms<1220,frame=ms<480?Math.min(3,Math.floor(ms/120)):4+Math.min(7,Math.floor((ms-480)/95));
    const size=ms<480?Math.min(w*.94,h*1.5):h*.91;
    const eyes=ms<480;
    this.portrait.setVisible(intro).setFrame(eyes?`eye${frame}`:frame).setPosition(cx,cy)
      .setDisplaySize(size,eyes?size*.31:size).setAlpha(clamp(ms/90)*clamp((1220-ms)/200));
    const casting=ms>=820&&ms<1660;
    if(casting!==this.hiding){this.hiding=casting;this.ctx.setPlayerVisible?.(!casting);}
    this.caster.setVisible(casting).setFrame(Math.min(7,Math.max(0,Math.floor((ms-820)/80)))).setFlipX(this.ctx.facing===-1);
    const ascent=clamp((ms-T.launch)/(T.exit-T.launch));
    if(ms>=T.launch&&ms<T.exit){
      const size=120+130*ease(ascent);
      this.bird.setOrigin(.5).setVisible(true).setFlipX(false).setFrame(Math.min(3,Math.floor(ascent*4)))
        .setPosition(this.ctx.x,this.ctx.y-65+(b.y-240-(this.ctx.y-65))*ascent*ascent)
        .setDisplaySize(size,size*1.35).setAlpha(1);
    }else if(ms>=T.entrance){
      const enter=ease((ms-T.entrance)/300),exit=ease((ms-5460)/400);
      const phase=((ms-T.entrance)/450)%1;
      const size=Math.min(b.w*.34,b.h*.69);
      this.bird.setOrigin(.5,.25).setVisible(exit<1).setFlipX(this.corner.right).setFrame(4+Math.floor(phase*12)%12)
        .setPosition(this.corner.x,this.corner.y-160*(1-enter)-exit*260+Math.sin(ms/150)*5)
        .setDisplaySize(size,size).setAlpha(enter*(1-exit));
    }else this.bird.setVisible(false);
    const live=new Map(this.targets().filter(p=>p.id).map(p=>[p.id,p]));
    this.feathers=this.feathers.filter(f=>{
      const t=(ms-f.born)/f.life;
      if(t>=1){f.sprite.destroy();return false;}
      const target=f.id?live.get(f.id):undefined;if(target)f.to={...target};
      const p=phoenixFlight(f.from,f.to,t,f.bend),next=phoenixFlight(f.from,f.to,t+.025,f.bend);
      f.sprite.setPosition(p.x,p.y).setRotation(Math.atan2(next.y-p.y,next.x-p.x)).setFrame(Math.floor(ms/55)%4);
      return true;
    });
    this.bursts=this.bursts.filter(v=>{
      const p=(ms-v.born)/v.life;if(p>=1){v.sprite.destroy();return false;}
      v.sprite.setFrame(4+Math.min(11,Math.floor(p*12))).setAlpha(1-p*.5);return true;
    });
  }
  destroy(){
    if(!this.active)return;this.active=false;
    for(const o of [...this.objects])o.destroy();this.feathers=[];this.bursts=[];this.planned.clear();
    this.ctx.setPlayerVisible?.(true);this.scene.cameras.main.useBounds=this.bounded;
    if(this.scene.sys.isActive())this.ctx.restoreCamera?.();
  }
}
const msBeat=(ms:number)=>Math.floor(ms/450);
