import * as Phaser from 'phaser';
import type { SkillFxContext, FxPoint } from './SkillFx';
import { moonKey } from './MoonExecutionArt';
import { MOON_TIMING as T, moonShadowAnchors } from './MoonExecutionTiming';
import type { SkillAudio } from './SkillAudio';

type Transient={sprite:Phaser.GameObjects.Sprite;born:number;life:number;start:number;frames:number;vx:number;vy:number;alpha:number;origin?:FxPoint};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};

/** Entire cinematic samples the gameplay clock: pausing/hit-stop never advances art ahead of damage. */
export class MoonExecution {
  elapsed=0;
  active=true;
  private objects=new Set<Phaser.GameObjects.GameObject>();
  private transient:Transient[]=[];
  private shadows:{point:FxPoint;born:number;clone:Phaser.GameObjects.Sprite;slash:Phaser.GameObjects.Sprite;seal:Phaser.GameObjects.Sprite}[];
  private shade:Phaser.GameObjects.Graphics;
  private overlay:Phaser.GameObjects.Graphics;
  private portrait:Phaser.GameObjects.Sprite;
  private moon:Phaser.GameObjects.Sprite;
  private focus:Phaser.GameObjects.Sprite;
  private sheath:Phaser.GameObjects.Sprite;
  private startZoom:number;
  private bounded:boolean;
  private startCenter:{x:number;y:number};
  private lastBeat=-Infinity;
  private final=false;
  constructor(private scene:Phaser.Scene,private ctx:SkillFxContext,private audio:SkillAudio){
    const cam=scene.cameras.main;
    this.startZoom=cam.zoom;this.bounded=cam.useBounds;cam.useBounds=false;
    this.startCenter={x:cam.worldView.centerX,y:cam.worldView.centerY};
    cam.stopFollow();
    this.shade=this.own(scene.add.graphics()).setDepth(50);
    this.overlay=this.own(scene.add.graphics()).setDepth(72);
    const center={x:ctx.bounds.x+ctx.bounds.w/2,y:ctx.bounds.y+ctx.bounds.h/2};
    const targets=ctx.targetsAt?.(center.x,center.y,Math.hypot(ctx.bounds.w,ctx.bounds.h))??ctx.targets;
    this.shadows=moonShadowAnchors(ctx.bounds,targets).map((point,i)=>({
      point,born:T.shadows+Math.floor(i/2)*T.waveGap+(i%2)*90,
      clone:this.own(scene.add.sprite(0,0,moonKey('shadow'),0)).setOrigin(.5,.94).setDepth(57).setDisplaySize(112,112).setVisible(false),
      slash:this.own(scene.add.sprite(point.x,point.y,moonKey('blades'),4)).setDepth(58).setDisplaySize(135,105).setVisible(false),
      seal:this.own(scene.add.sprite(point.x,point.y,moonKey('blades'),0)).setDepth(54).setDisplaySize(66,66).setVisible(false),
    }));
    this.focus=this.own(scene.add.sprite(ctx.x,ctx.y-28,moonKey('blades'),0)).setDepth(53).setDisplaySize(110,110).setVisible(false);
    this.portrait=this.own(scene.add.sprite(0,0,moonKey('portrait'),0)).setDepth(74);
    this.moon=this.own(scene.add.sprite(0,0,moonKey('moon'),0)).setDepth(73);
    this.sheath=this.own(scene.add.sprite(ctx.x,ctx.y,moonKey('sheath'),0)).setOrigin(.49,.98).setDisplaySize(72,72).setFlipX(true).setDepth(58).setVisible(false);
    this.audio.moon('seal');this.render();
  }
  get count():number{return this.objects.size;}
  private own<O extends Phaser.GameObjects.GameObject>(o:O):O{this.objects.add(o);o.once('destroy',()=>this.objects.delete(o));return o;}
  private burst(x:number,y:number,size:number,start=8,frames=8,life=220,angle=0):void{
    const sprite=this.own(this.scene.add.sprite(x,y,moonKey('blades'),start)).setDepth(62).setDisplaySize(size,size).setRotation(angle);
    this.transient.push({sprite,born:this.elapsed,life,start,frames,vx:0,vy:0,alpha:1});
  }
  step(dt:number):void{
    if(!this.active)return;
    const before=this.elapsed;this.elapsed+=dt;
    for(const [at,sound]of [[T.eye,'eye'],[T.moon+150,'cut'],[T.shadows,'shadow'],[T.shadows+T.waveGap,'shadow'],[T.shadows+T.waveGap*2,'shadow'],[T.lock,'sheath']] as const){
      if(before<at&&this.elapsed>=at)this.audio.moon(sound);
    }
    if(this.elapsed>=T.end){this.destroy();return;}
    this.render();
  }
  /** Only called by actual accepted local contacts, on the same step as onHit and damage numbers. */
  contact(targets:FxPoint[],last:boolean):void{
    this.lastBeat=this.elapsed;this.final=last;
    this.audio.moon(last?'finish':'hit');
    for(const [i,p]of targets.entries()){
      this.burst(p.x,p.y,last?112:84,last?8:4,last?8:4,last?390:125,
        last?(i%2?.15:-.15):(i%2?.45:-.65)+(Math.floor(this.elapsed/80)%2)*.7);
    }
    this.render();
  }
  private render():void{
    const ms=this.elapsed,cam=this.scene.cameras.main;
    const reveal=smooth((ms-1100)/500),restore=smooth((ms-4090)/310);
    const wide=Math.min(cam.width/(this.ctx.bounds.w+24),cam.height/(this.ctx.bounds.h+20));
    const zoom=this.startZoom+(wide-this.startZoom)*reveal;
    cam.setZoom(zoom+(this.startZoom-zoom)*restore);
    const center={x:this.ctx.bounds.x+this.ctx.bounds.w/2,y:this.ctx.bounds.y+this.ctx.bounds.h/2};
    const blend=reveal*(1-restore);
    cam.centerOn(this.startCenter.x+(center.x-this.startCenter.x)*blend,this.startCenter.y+(center.y-this.startCenter.y)*blend);
    // worldView is updated by Phaser at render time; derive the layout from the current camera.
    const w=cam.width/cam.zoom,h=cam.height/cam.zoom;
    const cx=cam.scrollX+cam.width/2,cy=cam.scrollY+cam.height/2;
    const x=cx-w/2,y=cy-h/2,fade=Math.min(clamp(ms/160),clamp((T.end-ms)/360));
    this.shade.clear().fillStyle(0x020617,(ms<T.shadows?.91:.70)*fade).fillRect(x-20,y-20,w+40,h+40);
    this.overlay.clear().fillStyle(0x070b24,.13*fade).fillRect(x,y,w,h);
    // Widening the camera must not expose repeated scenery beyond the actual map.
    const bounds=this.ctx.bounds;
    this.overlay.fillStyle(0x02030a,reveal*fade);
    if(y<bounds.y)this.overlay.fillRect(x,y,w,bounds.y-y);
    if(y+h>bounds.y+bounds.h)this.overlay.fillRect(x,bounds.y+bounds.h,w,y+h-bounds.y-bounds.h);
    if(x<bounds.x)this.overlay.fillRect(x,y,bounds.x-x,h);
    if(x+w>bounds.x+bounds.w)this.overlay.fillRect(bounds.x+bounds.w,y,x+w-bounds.x-bounds.w,h);
    this.overlay.fillStyle(0x02030a,.95*fade).fillRect(x,y,w,h*.075).fillRect(x,y+h*.925,w,h*.075);
    const flash=clamp(1-(ms-this.lastBeat)/(this.final?190:65));
    if(flash>0)this.overlay.fillStyle(this.final?0xe1f5ff:0x9edcff,(this.final?.12:.025)*flash).fillRect(x,y,w,h);
    const portraitFade=clamp(ms/160)*clamp((1120-ms)/230);
    const frame=ms<T.eye?Math.min(4,Math.floor(ms/125)):Math.min(11,5+Math.floor((ms-T.eye)/65));
    const size=Math.min(w*.68,h*.91)*(1+clamp(ms/950)*.055);
    this.portrait.setFrame(frame).setPosition(cx-w*.10+(1-smooth(ms/200))*w*.12,cy+h*.025).setDisplaySize(size,size).setAlpha(portraitFade).setVisible(portraitFade>0);
    const moonT=(ms-T.moon)/700,moonAlpha=clamp(moonT*5)*clamp((1.15-moonT)*3);
    const moonSize=Math.max(h*1.95,w*1.05)*(1+.06*smooth(moonT));
    this.moon.setVisible(moonAlpha>0&&ms>=T.moon).setFrame(Math.min(7,Math.max(0,Math.floor(moonT*8))))
      .setPosition(cx+w*.04,cy).setDisplaySize(moonSize,moonSize).setAlpha(moonAlpha);
    if(ms>T.eye&&ms<T.eye+100){this.overlay.fillStyle(0xff234e,.14*(1-(ms-T.eye)/100)).fillRect(x,cy-h*.08,w,2);}

    // The player remains at the physical position, directing the shadows instead of traversing a glyph.
    const live=this.ctx.playerAt?.()??{x:this.ctx.x,y:this.ctx.y-26};
    const showSheath=ms>=T.sheath&&ms<T.end-170;
    this.ctx.setPlayerVisible?.(!showSheath);
    const costume=this.ctx.bodyArt!.path.includes('hood')?2:this.ctx.bodyArt!.path.includes('ninja')?1:0;
    this.sheath.setVisible(showSheath).setPosition(live.x,live.y+26)
      .setFrame(costume*4+Math.min(3,Math.max(0,Math.floor((ms-T.sheath)/70))));
    const focusAlpha=clamp((ms-T.shadows)/180)*clamp((T.lock-ms)/220);
    this.focus.setVisible(focusAlpha>0).setPosition(live.x,live.y).setFrame(1).setRotation(-.18)
      .setAlpha(focusAlpha*.32);
    for(const [i,shadow]of this.shadows.entries()){
      const age=ms-shadow.born,t=clamp(age/T.shadowLife),direction=i%2?-1:1;
      const visible=age>=0&&age<T.shadowLife;
      const alpha=clamp(age/65)*clamp((T.shadowLife-age)/110);
      shadow.clone.setVisible(visible).setFrame(Math.min(7,Math.floor(t*8))).setFlipX(direction===-1)
        .setPosition(shadow.point.x-direction*(42-smooth(age/300)*20),shadow.point.y+32)
        .setAlpha(alpha*.94);
      const slashAge=age-150,slashT=clamp(slashAge/250);
      shadow.slash.setVisible(slashAge>=0&&slashAge<250).setFrame(4+Math.min(3,Math.floor(slashT*4)))
        .setFlipX(direction===-1).setRotation(i%2?.18:-.22)
        .setAlpha(clamp(slashAge/55)*clamp((250-slashAge)/90)*.8);
      // A quiet moon mark remains after the clone has vanished; no hurt effect until accepted contact.
      const sealAlpha=clamp((age-180)/160)*clamp((T.hits[0]-ms)/180);
      shadow.seal.setVisible(sealAlpha>0).setFrame(1).setRotation(i*.55+ms*.00012)
        .setAlpha(sealAlpha*(.32+.06*Math.sin(ms*.004+i)));
    }
    this.transient=this.transient.filter(t=>{
      const age=ms-t.born,p=age/t.life;
      if(p>=1){t.sprite.destroy();return false;}
      if(t.frames)t.sprite.setFrame(t.start+Math.min(t.frames-1,Math.floor(p*t.frames)));
      t.sprite.setAlpha(t.alpha*(1-p*.85));
      // Only particles move; sequence anchors and afterimages remain at their recorded location.
      t.origin??={x:t.sprite.x,y:t.sprite.y};
      t.sprite.setPosition(t.origin.x+t.vx*age/1000,t.origin.y+t.vy*age/1000);
      return true;
    });
  }
  destroy():void{
    if(!this.active)return;this.active=false;
    for(const object of [...this.objects])object.destroy();this.transient=[];
    const camera=this.scene.cameras.main;
    if(camera)camera.useBounds=this.bounded;
    if(this.scene.sys.isActive()){
      this.ctx.setPlayerVisible?.(true);
      if(camera)this.ctx.restoreCamera?.();
    }
  }
}
