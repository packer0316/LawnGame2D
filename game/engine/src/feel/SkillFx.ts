import * as Phaser from 'phaser';
import type { Rect, SkillDef, ClassId } from '@lawn/shared';
import type { ContentBundle } from '../content/bundle';
import { DEPTH } from '../map/MapView';
import { frameName } from '../render/sheets';
import type { FxLayer } from './FxLayer';
import { SkillVfxKit } from './SkillVfxKit';
import { CLASS_ENERGY, skillEnergyColor, impactFeel, VFX_BUDGET } from './SkillPresentation';
import { atlasKey, BURST_DURATION, loadSkillAtlases, type SkillAtlasName } from './SkillAtlas';
import { TigerSummon } from './TigerSummon';
import { AssassinStorm } from './AssassinStorm';
import { FallingRain } from './FallingRain';
import { firstRainSurface, type RainSegment } from './RainGeometry';
import { SkillAudio } from './SkillAudio';
import { bladeFlipX, bladeSpinMs, createSkillWeapon, orientSkillWeapon } from './SkillWeapons';

export interface FxPoint {
  x: number;
  y: number;
}

/** 一個技能特效需要的資訊（世界座標）。 */
export interface SkillFxContext {
  /** 實際投射物方向；箭雨與近戰由技能方向補上。 */
  impactAngle?: number;
  classId?: ClassId;
  /** 角色腳底 */
  x: number;
  y: number;
  facing: 1 | -1;
  /** 這一刀的判定範圍；演出時點（cue）時為下一刀的範圍 */
  area: Rect | null;
  /** 打中的怪（判定框中心） */
  targets: FxPoint[];
  /** 技能開始時的位置（path、瞬移、衝刺的起點） */
  origin: FxPoint | null;
  /** 連鎖：上一個點（上一隻怪或出手位置） */
  from: FxPoint | null;
  /** 押注等級顏色 */
  tint: number;
  /** cue 到下一刀判定的時間（隕石落下要多久） */
  leadMs: number;
  /** 鏡頭看得到的範圍 */
  view: Rect;
  /** 整張地圖（全地圖大絕招用） */
  bounds: Rect;
  /** 散射技能挑好的點（分身飛鏢、影分身） */
  points: FxPoint[];
  /** x 處從 fromY 往下第一個地面的高度 */
  groundAt: (x: number, fromY: number) => number | null;
  rainTerrain?: readonly RainSegment[];
  /** 角色目前的整體動畫幀（殘影、分身用） */
  frame: { key: string; frame: string } | null;
  /** 到這個技能最後一刀還有多久（持續型特效用） */
  remainingMs: number;
  /** 這個技能往前打得到多遠 */
  reach: number;
  /** Live contacts are cosmetic only; damage remains in the strike schedule. */
  targetsAt?: (x:number,y:number,radius:number)=>FxPoint[];
  playerAt?: ()=>FxPoint;
}

const CHEST = 26;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * 技能的程式特效（SPEC §4.6）：閃電、隕石、衝擊波、箭雨、殘影、大絕招…
 * 分層能量刀光、蓄力匯聚、命中星芒與餘燼；實際判定仍由技能資料與場景處理。
 * 大小都跟著判定範圍走，改技能範圍時特效會一起變。換房時 clear() 全部清掉。
 */
export class SkillFx {
  private readonly objects = new Set<Phaser.GameObjects.GameObject>();
  private readonly lights = new Set<Phaser.GameObjects.Light>();
  private readonly kit: SkillVfxKit;
  private readonly audio: SkillAudio;
  private activeReaper: Phaser.GameObjects.Sprite | null = null;
  private reaperBeat=0;
  private tiger:TigerSummon|null=null;
  private storm:AssassinStorm|null=null;
  private readonly rains = new Set<FallingRain>();
  private readonly rainWaves = new Map<string, FallingRain[]>();
  private activeDragon:Phaser.GameObjects.Sprite|null=null;
  private comboLabel:Phaser.GameObjects.Text|null=null;
  private readonly trailTimes = new WeakMap<Phaser.GameObjects.Sprite,number>();
  private goldContacts:{x:number;y:number;at:number}[]=[];

  static async preload(scene: Phaser.Scene): Promise<void> {
    await loadSkillAtlases(scene);
  }

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bundle: ContentBundle,
    /** 播完就消失的 sprite 特效（塵土、火花、刀光）交給 FxLayer */
    private readonly oneShots: FxLayer,
    private readonly lit: () => boolean,
  ) {
    this.kit = new SkillVfxKit(scene);
    this.audio = new SkillAudio(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.clear();this.audio.destroy();});
  }

  get count(): number { return this.objects.size + this.kit.count + [...this.rains].reduce((sum, rain) => sum + rain.count, 0); }

  begin(skill: SkillDef, ctx: SkillFxContext): void {
    if(skill.kind==='basic')return;
    this.prepareRain(skill, ctx);
    this.comboLabel?.destroy();this.comboLabel=null;
    if(skill.id==='skill_0008'){this.activeDragon?.destroy();this.activeDragon=null;}
    if(skill.id==='skill_0009'){this.tiger?.destroy();this.tiger=new TigerSummon(this.scene,this.kit,ctx,skill);}
    if(skill.id==='skill_0032'){
      this.storm?.destroy();
      this.storm=new AssassinStorm(this.scene,this.kit,ctx,skill,(name,x,y,size)=>this.sequence(name,x,y,size),p=>this.goldContact(p));
    }
    const palette=CLASS_ENERGY[skill.classId];
    this.audio.play(skill.classId,skill.ultimate?1:.5,true);
    const chargeMs=skill.strikes[0]!.atMs;
    if(skill.classId==='mage')this.kit.charge(ctx.x,ctx.y,palette.color,chargeMs,!!skill.ultimate);
    else if(skill.classId==='warrior'){
      const g=this.gfx(ctx.x,ctx.y-CHEST);
      for(let i=0;i<5;i++)g.lineStyle(1,0xb8e8ff,.6).lineBetween(-70-i*8,18+i*5,-12,8);
      g.setScale(ctx.facing,1);this.fade(g,chargeMs);
      this.kit.glow(ctx.x+ctx.facing*24,ctx.y-30,0x94d4ff,80,chargeMs,.45);
    }else if(skill.classId==='archer'){
      const bow=this.gfx(ctx.x+ctx.facing*18,ctx.y-28);
      bow.lineStyle(3,0xffcc70,.85).beginPath().arc(0,0,42,-1.2,1.2).strokePath();
      bow.lineStyle(1,0xfff7d2,.8).lineBetween(15,-39,-18,0).lineBetween(-18,0,15,39);
      bow.setScale(ctx.facing,1);this.fade(bow,chargeMs);
      this.kit.burst(ctx.x,ctx.y-28,0xffd080,.55,8,ctx.facing===1?0:Math.PI);
    }else if(skill.id!=='skill_0032'){
      const kind=skill.id==='skill_0035'?'crescent':skill.id==='skill_0046'?'split':'fuma';
      const seal=this.track(createSkillWeapon(this.scene,kind,ctx.x,ctx.y-CHEST,85)).setAlpha(.25);
      this.fade(seal,chargeMs,{scaleX:seal.scaleX*.4,scaleY:seal.scaleY*.4});
    }
    if(skill.id==='skill_0043'){this.reaperBeat=0;this.kit.cinematic(skill.strikes.at(-1)!.atMs+1400);}
    if(skill.ultimate)this.kit.veil(palette.shadow,Math.min(650,skill.strikes[0]!.atMs),.3);
  }

  release(skill: SkillDef, ctx: SkillFxContext): void {
    const color=skillEnergyColor(skill);
    this.kit.burst(ctx.x+ctx.facing*18,ctx.y-CHEST,color,.45,6,ctx.facing===1?0:Math.PI);
  }

  projectileTrail(skill: SkillDef,sprite: Phaser.GameObjects.Sprite,angle:number):void {
    const now=this.scene.time.now;
    if(now-(this.trailTimes.get(sprite)??-Infinity)<(skill.classId==='assassin'?90:skill.classId==='archer'?55:32))return;
    this.trailTimes.set(sprite,now);
    this.kit.trail(sprite.x,sprite.y,CLASS_ENERGY[skill.classId].color,angle,skill.classId==='mage');
    if(skill.classId==='archer'){
      const ghost=this.track(this.scene.add.sprite(sprite.x,sprite.y,sprite.texture.key,sprite.frame.name))
        .setDepth(DEPTH.fx-1).setDisplaySize(sprite.displayWidth*.9,sprite.displayHeight*.9).setAlpha(.16);
      orientSkillWeapon(ghost,angle);
      this.fade(ghost,110);
      this.kit.burst(sprite.x,sprite.y,skill.projectile?.explode?0xffad59:0x9eeedc,.18,2,angle+Math.PI);
    }
    if(skill.classId==='assassin'){
      const wind=this.gfx(sprite.x,sprite.y);
      drawBladeArc(wind,30,angle-.9,angle+1.2,0xff6880,2);
      this.fade(wind,180,{scaleX:1.4,scaleY:1.4});
      this.kit.burst(sprite.x,sprite.y,0xff9caa,.22,2,angle+Math.PI);
    }
  }

  contact(skill: SkillDef,index: number,ctx: SkillFxContext): ReturnType<typeof impactFeel> {
    const feel=impactFeel(skill,index);
    this.audio.play(skill.classId,feel.strength);
    // 每個可見的實際命中都有核心效果；只縮減附加粒子，不截掉後面的怪物。
    const visible=ctx.targets.filter(t=>t.x>=ctx.view.x-100&&t.x<=ctx.view.x+ctx.view.w+100&&t.y>=ctx.view.y-100&&t.y<=ctx.view.y+ctx.view.h+100);
    for(const [targetIndex,t] of visible.entries()){
      if(skill.classId==='archer'){
        const rain=skill.id==='skill_0023'||skill.id==='skill_0044';
        const angle=ctx.impactAngle??(rain?Math.PI/2:ctx.facing===1?0:Math.PI);
        this.archerContact(t,angle,feel.strength,!!skill.projectile?.explode||skill.id==='skill_0045',targetIndex<4);
      }
      else if(['skill_0031','skill_0032','skill_0035','skill_0046'].includes(skill.id))this.goldContact(t,true);
      else if(skill.classId==='assassin')this.kit.burst(t.x,t.y,skillEnergyColor(skill),feel.strength,6);
      else this.kit.classImpact(skill.classId,t.x,t.y,feel.strength);
    }
    if(skill.ultimate&&feel.last)this.kit.veil(CLASS_ENERGY[skill.classId].shadow,260,.22);
    if(skill.strikes.length>1){
      this.comboLabel?.destroy();
      const color=`#${skillEnergyColor(skill).toString(16).padStart(6,'0')}`;
      const caption={warrior:'連斬',mage:'連鎖',archer:'連射',assassin:'連刃'}[skill.classId];
      const label=this.track(this.scene.add.text(ctx.x+ctx.facing*48,ctx.y-100,`${index+1} ${caption}`,{fontFamily:'Segoe UI, sans-serif',fontSize:feel.last?'24px':'19px',fontStyle:'bold',color,stroke:'#101020',strokeThickness:4})).setDepth(DEPTH.numbers+4).setOrigin(.5).setResolution(2);
      this.comboLabel=label;label.once(Phaser.GameObjects.Events.DESTROY,()=>{if(this.comboLabel===label)this.comboLabel=null;});
      this.fade(label,360,{y:label.y-16},feel.last?180:60);
    }
    return feel;
  }

  basicMelee(skill:SkillDef,ctx:SkillFxContext):void {
    const stage=Number(skill.id.slice(-1));
    const blade=this.sequence('blade',ctx.x+ctx.facing*27,ctx.y-CHEST,stage===3?170:140).setFlipX(bladeFlipX(ctx.facing)).setAngle((stage===2?40:-35)*ctx.facing);
    blade.anims.timeScale=1.5;
    this.kit.burst(ctx.x+ctx.facing*45,ctx.y-CHEST,0x96daff,.55,6,ctx.facing===1?0:Math.PI);
  }

  play(name: string, ctx: SkillFxContext): void {
    ctx={...ctx,targets:ctx.targets.filter(p=>p.x>=ctx.view.x-120&&p.x<=ctx.view.x+ctx.view.w+120&&p.y>=ctx.view.y-150&&p.y<=ctx.view.y+ctx.view.h+150).slice(0,VFX_BUDGET.targets)};
    switch (name) {
      case 'whirl':
        return this.whirl(ctx);
      case 'iaido':
        return this.iaido(ctx);
      case 'quake':
        return this.quake(ctx);
      case 'streak':
        return this.streak(ctx);
      case 'rising':
        return this.rising(ctx);
      case 'wave':
        return this.tiger?.bite(ctx.targets);
      case 'lightning':
        return this.lightning(ctx);
      case 'meteor':
        return this.meteor(ctx);
      case 'impact':
        return this.impact(ctx);
      case 'arcane':
        return this.arcane(ctx);
      case 'nova':
        return this.nova(ctx);
      case 'chainBolt':
        return this.chainBolt(ctx);
      case 'arrowUp':
        return this.arrowUp(ctx);
      case 'arrowRain':
        return this.arrowRain(ctx, ctx.area, 1);
      case 'arrowFan':
        return this.fan(ctx, 'arrow', 7);
      case 'bladeFan':
        return this.storm?.strike(ctx.targets);
      case 'shadowSlash':
        return this.shadowSlash(ctx);
      case 'pathSlash':
        return this.pathSlash(ctx);
      case 'boomerang':
        return this.boomerang(ctx);
      case 'explosion':
        return this.explosion(ctx.x, ctx.y, 1.6, 0xffa040);
      // 大絕招（全地圖）
      case 'skyFlash':
        return this.skyFlash(0xfff1c8);
      case 'holyWave':
        return this.holyWave(ctx);
      case 'holyHit':
        return this.targetCuts(ctx, 0xffe08a);
      case 'swordRain':
        return this.swordRain(ctx);
      case 'meteorShower':
        return this.meteorShower(ctx);
      case 'summonCircle':
        return this.summonCircle(ctx);
      case 'reaper':
        return this.reaper(ctx);
      case 'reaperSweep':
        return this.reaperSweep(ctx);
      case 'darkBurst':
        return this.darkBurst(ctx);
      case 'arrowVolley':
        return this.arrowVolley(ctx);
      case 'screenArrowRain':
        return this.arrowRain(ctx, ctx.view, 1.6);
      case 'comet':
        return this.comet(ctx);
      case 'cometBurst':
        return this.cometBurst(ctx);
      case 'shurikenStorm':
        return this.shurikenStorm(ctx);
      case 'shurikenSpin':
        return this.pointRings(ctx);
      case 'shadowClones':
        return this.shadowClones(ctx);
      case 'cloneSlash':
        return this.cloneSlash(ctx);
    }
  }

  /** 殘影：目前的整體動畫幀，冷色、加亮、淡出。 */
  afterimage(frame: { key: string; frame: string }, x: number, y: number, facing: 1 | -1, color = 0x7fd8ff, alpha = 0.55, duration = 280): Phaser.GameObjects.Sprite {
    const ghost = this.track(this.scene.add.sprite(x, y, frame.key, frame.frame))
      .setOrigin(64 / 128, 120 / 128)
      .setFlipX(facing === 1)
      .setDepth(DEPTH.player - 1)
      .setTint(color)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.fade(ghost, duration);
    return ghost;
  }

  /** 爆炸：explosion sprite + 衝擊環 + 光。 */
  explosion(x: number, y: number, scale: number, color: number): void {
    this.kit.burst(x,y-12,color,scale*.8,22);
    this.kit.smoke(x,y-8,0x343144,scale);
    this.kit.glow(x,y-16,color,180*scale,400,.8);
    this.sequence('fire',x,y-38*scale,105*scale).setAlpha(.95);
    this.ring(x, y - 12, 10, 60 * scale, 0xffd08a, 4, 320);
    this.flash(x, y - 20, color, 160 * scale, 2.2, 380);
  }

  /** Archer-only phoenix feathers, not the mage's meteor/fireball atlas. */
  phoenixBurst(x:number,y:number,power:number):void {
    this.kit.glow(x,y,0xffa52e,220*power,330,.7);
    this.kit.burst(x,y,0xffc55d,power,24);
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5;
      const feather=this.gfx(x,y).setRotation(a);
      feather.fillStyle(0xe87320,.7).fillTriangle(0,-5,65*power,0,0,5);
      feather.fillStyle(0xffeeb6,1).fillTriangle(5,-2,60*power,0,5,2);
      this.fade(feather,320,{x:x+Math.cos(a)*90*power,y:y+Math.sin(a)*90*power,scaleX:.5,scaleY:.2});
    }
    this.ring(x,y,10,90*power,0xffd789,2,300,.5);
  }

  /** Mage-only vertical spirit tears and rising soul motes. */
  private soulRift(x:number,y:number,power:number):void {
    const size=(90+power*40)*rand(.9,1.1);
    const soul=this.sequence('soul',x,y+24,size).setOrigin(.5,.85).setFlipX(this.reaperBeat%2===0).setAlpha(.92);
    this.scene.tweens.add({targets:soul,y:soul.y-26,duration:440,ease:'Sine.Out'});
    this.kit.glow(x,y,0xb56eff,100*power,250,.4);
    this.kit.burst(x,y,0xb283ff,power,5,-Math.PI/2);
  }

  clear(): void {
    for (const rain of this.rains) rain.destroy();
    this.rainWaves.clear();
    this.tiger?.destroy();this.tiger=null;
    this.storm?.destroy();this.storm=null;
    this.goldContacts=[];
    this.activeReaper = null;
    this.activeDragon = null;
    this.reaperBeat=0;
    this.kit.clear();
    this.audio.clear();
    const objects = [...this.objects];
    this.scene.tweens.killTweensOf(objects);
    for (const object of objects) object.destroy();
    this.objects.clear();
    for (const light of this.lights) { this.scene.tweens.killTweensOf(light); this.scene.lights.removeLight(light); }
    this.lights.clear();
  }

  // ---------------------------------------------------------------------------
  // 劍士
  // ---------------------------------------------------------------------------

  /** 旋風斬：身體周圍轉一圈的刀光環（半徑 = 判定半徑）。 */
  private whirl(ctx: SkillFxContext): void {
    const r = (ctx.area?.w ?? 180) / 2;
    this.sequence('blade',ctx.x,ctx.y-CHEST,r*2.5).setFlipX(bladeFlipX(ctx.facing)).setAngle(-35*ctx.facing).setAlpha(.95);
    const g = this.gfx(ctx.x, ctx.y - CHEST);
    for (let i = 0; i < 2; i += 1) {
      const start = (i / 3) * Math.PI * 2;
      drawBladeArc(g,r*.95,start,start+1.8,0x8bddff,8);
    }
    g.setScale(0.6, 0.45);
    this.fade(g, 260, { rotation: -ctx.facing * Math.PI * 1.4, scaleX: 1.25, scaleY: 0.9 });
  }

  /** 拔刀斬：起點到終點一道白光，在每隻怪身上爆開斬痕。 */
  private iaido(ctx: SkillFxContext): void {
    this.kit.veil(0x111a2e,240,.24);
    this.kit.burst(ctx.x,ctx.y-CHEST,0x98e9ff,1.3,18,ctx.facing===1?0:Math.PI);
    const area = ctx.area;
    const y = ctx.y - CHEST;
    const x1 = area ? area.x : Math.min(ctx.origin?.x ?? ctx.x, ctx.x);
    const x2 = area ? area.x + area.w : Math.max(ctx.origin?.x ?? ctx.x, ctx.x);
    const h = area?.h ?? 70;
    const g = this.gfx(0, 0);
    g.fillStyle(0x9fe8ff, 0.16).fillTriangle(x1,y-h*.13,x2,y,x1,y+h*.13);
    g.fillStyle(0xcaf7ff, .8).fillTriangle(x1,y-3,x2,y,x1,y+3);
    g.lineStyle(1,0xffffff,1).lineBetween(x1,y,x2,y);
    this.fade(g, 340);
    for (const t of ctx.targets) {
      this.cut(t.x, t.y, 32, ctx.tint);
    }
    this.flash((x1 + x2) / 2, y, 0xcff4ff, 260, 2, 300);
  }

  /** 地裂重劈：這一段地面冒出岩刺與塵土（數量跟著範圍寬度）。 */
  private quake(ctx: SkillFxContext): void {
    const area=ctx.area;
    if(!area)return;
    const x=area.x+area.w/2,ground=ctx.groundAt(x,ctx.y-35)??ctx.y;
    this.sequence('earth',x,ground+8,310).setOrigin(.5,.96).setDisplaySize(Math.max(280,area.w*1.8),310).setFlipX(ctx.facing===-1);
    this.kit.smoke(x,ground,0x556276,1.7);
    this.kit.burst(x,ground-12,0xb0e8ff,1.4,15,-Math.PI/2);
    this.ring(x,ground-3,12,140,0xa0dfff,3,300,.22);
    this.flash(x,ground-80,0x93cfff,260,2,350);
  }

  /** 突刺、穿透箭：一道貫穿的光束（粗細跟著範圍高度）。 */
  private streak(ctx: SkillFxContext): void {
    if(ctx.classId==='archer'){
      const start=ctx.facing===1?ctx.area?.x??ctx.x:(ctx.area?ctx.area.x+ctx.area.w:ctx.x);
      const arrow=this.track(createSkillWeapon(this.scene,'arrow',start,ctx.y-CHEST,230));
      orientSkillWeapon(arrow,ctx.facing===1?0:Math.PI);
      this.scene.tweens.add({targets:arrow,x:start+ctx.facing*(ctx.area?.w??500),duration:170,onComplete:()=>this.fade(arrow,120)});
      // 實際命中由 contact() 統一畫，避免穿透箭重複堆兩層受擊光。
      return;
    }
    const area=ctx.area;
    const from=ctx.origin?.x??ctx.x-ctx.facing*120;
    const end=ctx.x+ctx.facing*100;
    const center=(from+end)/2,y=ctx.y-CHEST;
    // One horizontal pressure lance; rock eruptions belong to Ground Cleave.
    const pressure=this.sequence('thrust',center,y,540).setDisplaySize(Math.max(480,(area?.w??280)*1.65),300).setFlipX(ctx.facing===-1);
    this.scene.tweens.add({targets:pressure,x:center+ctx.facing*70,duration:700,ease:'Cubic.Out'});
    const collar=this.gfx(from+ctx.facing*35,y);
    collar.lineStyle(5,0x8dcfff,.45).strokeEllipse(0,0,26,124);
    collar.lineStyle(1,0xf2fbff,.8).strokeEllipse(0,0,32,136);
    this.fade(collar,600,{x:from+ctx.facing*110,scaleY:1.5});
    for(let i=0;i<4;i++){
      const x=from+(end-from)*i/3,ground=ctx.groundAt(x,ctx.y-40)??ctx.y;
      this.kit.smoke(x,ground,0x617283,.7);
      this.kit.burst(x,y,0xb1dfff,.55,4,ctx.facing===1?Math.PI:0);
    }
    this.flash(end,y,0x9cdaff,210,1.3,500);
  }

  /** 昇龍斬：往上的月牙刀光（大小跟著判定半徑）。 */
  private rising(ctx: SkillFxContext): void {
    if(!this.activeDragon?.active){
      const x=ctx.x+ctx.facing*48,ground=ctx.groundAt(x,ctx.y-40)??ctx.y;
      const dragon=this.sequence('dragon',x,ground+10,390).setOrigin(.5,.96).setFlipX(ctx.facing===-1);
      this.activeDragon=dragon;
      dragon.once(Phaser.GameObjects.Events.DESTROY,()=>{if(this.activeDragon===dragon)this.activeDragon=null;});
      this.scene.tweens.add({targets:dragon,y:Math.max(ground-70,ctx.view.y+390*.96+16),x:x+ctx.facing*35,duration:660,ease:'Cubic.Out'});
    }
    this.kit.burst(ctx.x,ctx.y-26,0x9bddff,1.4,18,-Math.PI/2);
    this.flash(ctx.x,ctx.y-80,0x9bddff,240,2,250);
  }

  /** Called before Player.step so presentation and strike positions share one fixed clock. */
  step(dt:number):void {
    for (const rain of this.rains) rain.step(dt);
    this.tiger?.step(dt);
    if(this.tiger&&!this.tiger.sprite.active)this.tiger=null;
    this.storm?.step(dt);
    if(this.storm&&!this.storm.active)this.storm=null;
  }

  tigerHitRect(index:number):Rect|null {return this.tiger?.hitRect(index)??null;}
  tigerFloorAt(x:number):number|null {return this.tiger?.floorAt(x)??null;}
  get tigerImpactX():number|undefined{return this.tiger?.sprite.x;}

  /** 雷電術：每隻目標從天而降一道閃電；沒打到也在範圍內落雷。 */
  private lightning(ctx: SkillFxContext): void {
    const points=ctx.targets.length?ctx.targets:this.randomPoints(ctx.area,3,ctx.y-20);
    this.kit.veil(0x161b46,240,.28);
    for(const [i,p]of points.entries()){
      this.sequence('lightning',p.x,p.y+25,310).setOrigin(.5,.95).setDisplaySize(175,330).setFlipX(i%2===0);
      this.kit.glow(p.x,p.y,0x956aff,120,230,.65);
      this.flash(p.x,p.y,0xa69aff,180,2.3,220);
      this.kit.burst(p.x,p.y,0xb6acff,.8,7);
    }
  }

  /** 連鎖閃電：從上一個點跳到這隻怪。 */
  private chainBolt(ctx: SkillFxContext): void {
    const target = ctx.targets[0];
    if (!target) return;
    const from = ctx.from ?? { x: ctx.x + ctx.facing * 14, y: ctx.y - CHEST };
    this.bolt(from.x, from.y, target.x, target.y, 0xb9a2ff, 200);
    this.flash(target.x, target.y, 0xb9a2ff, 110, 2, 200);
  }

  /** 隕石術（cue）：火球從後上方斜斜落到範圍中央，leadMs 後撞地。 */
  private meteor(ctx: SkillFxContext): void {
    const area = ctx.area;
    const impactX = area ? area.x + area.w / 2 : ctx.x + ctx.facing * 200;
    this.kit.charge(impactX,ctx.y,0xffa451,ctx.leadMs,true);
    this.fallingMeteor(impactX - ctx.facing * 260, ctx.y - 400, impactX, ctx.y - 10, Math.max(120, ctx.leadMs), 1.3);
  }

  /** 隕石撞擊：大爆炸、衝擊環、塵土。 */
  private impact(ctx: SkillFxContext): void {
    const area = ctx.area;
    const x = area ? area.x + area.w / 2 : ctx.x + ctx.facing * 200;
    const w = area?.w ?? 340;
    this.explosion(x, ctx.y, 2.8, 0xffa040);
    this.ring(x, ctx.y - 4, 20, w * 0.6, 0xffe0a0, 5, 420, 0.35);
    for (let i = 0; i < 6; i += 1) this.oneShots.spawn('dust', x + rand(-w / 2, w / 2), ctx.y - 6, { scale: 1.6 });
  }

  /** 瞬移術：起點與終點各一個法陣環，路線上一串星點。 */
  private arcane(ctx: SkillFxContext): void {
    const from = ctx.origin ?? { x: ctx.x, y: ctx.y };
    this.sequence('arcane',from.x,from.y-CHEST,125).setTint(0xd4b6ff);
    this.sequence('arcane',ctx.x,ctx.y-CHEST,145);
    this.ring(from.x, from.y - CHEST, 6, 56, 0xc59bff, 3, 300);
    this.ring(ctx.x, ctx.y - CHEST, 6, 56, 0x9fe8ff, 3, 300);
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const star = this.gfx(from.x + (ctx.x - from.x) * t, from.y + (ctx.y - from.y) * t - CHEST + rand(-16, 16));
      star.fillStyle(i % 2 === 0 ? 0xd8c2ff : 0xa8f0ff, 1).fillTriangle(0, -5, 4, 0, 0, 5).fillTriangle(0, -5, -4, 0, 0, 5);
      this.fade(star, 320, { y: star.y - 12, angle: 90 }, i * 10);
    }
    this.flash(from.x, from.y - CHEST, 0xc59bff, 140, 1.8, 260);
  }

  /** 冰霜新星：向外擴散的冰環與冰晶（半徑 = 判定半徑）。 */
  private nova(ctx: SkillFxContext): void {
    const r = (ctx.area?.w ?? 280) / 2;
    const cx = ctx.x;
    const cy = ctx.y - CHEST;
    this.sequence('arcane',cx,cy,r*2.3);
    this.kit.glow(cx,cy,0x77dbff,r*2,400,.65);
    this.kit.burst(cx,cy,0xb7f4ff,1.4,24);
    this.ring(cx, cy, 16, r, 0xbff4ff, 6, 380, 0.6);
    this.ring(cx, cy, 10, r * 0.75, 0xffffff, 2, 320, 0.6);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const shard = this.gfx(cx + Math.cos(a) * 20, cy + Math.sin(a) * 12);
      shard.fillStyle(0xd8f8ff, 1).fillTriangle(-3, 0, 3, 0, 0, -16).setRotation(a + Math.PI / 2);
      this.fade(shard, 360, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.6 });
    }
    this.flash(cx, cy, 0x9fe8ff, r * 1.4, 2, 360);
  }

  // ---------------------------------------------------------------------------
  // 弓箭手、刺客
  // ---------------------------------------------------------------------------

  /** 箭雨（cue）：先往天上射一支箭。 */
  private arrowUp(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 8;
    const y = ctx.y - 34;
    this.kit.burst(x,y,0x8eeec5,.8,14,-Math.PI/2);
    const arrow = this.fxSprite('arrow', x, y);
    if(arrow){orientSkillWeapon(arrow,-Math.PI/2);arrow.setDisplaySize(156,39);}
    if (arrow) this.fade(arrow, 260, { y: y - 300 });
    const g = this.gfx(0, 0);
    g.fillStyle(0xffffff, 0.8).fillRect(x - 1, y - 300, 2, 300);
    this.fade(g, 220);
  }

  /** 箭雨：範圍內的箭從天而降，落在各處地面（density 越大越密）。 */
  private arrowRain(ctx: SkillFxContext, area: Rect | null, density: number): void {
    if (!area) return;
    this.fallingRain(ctx, area, 'arrow', Math.min(26, Math.max(1, Math.round(area.w / 100 * density))));
  }

  /** Pre-roll each wave so the scheduled strike is arrival, never the launch. */
  private prepareRain(skill: SkillDef, ctx: SkillFxContext): void {
    for (const [index, strike] of skill.strikes.entries()) {
      if (!['swordRain', 'arrowRain', 'screenArrowRain'].includes(strike.fx ?? '')) continue;
      const kind = strike.fx === 'swordRain' ? 'sword' : 'arrow';
      const area = strike.fx === 'arrowRain' ? ctx.area : ctx.view;
      if (!area) continue;
      const count = kind === 'sword' ? Math.min(22, Math.max(1, Math.round(area.w / 115)))
        : Math.min(26, Math.max(1, Math.round(area.w / 100 * (strike.fx === 'screenArrowRain' ? 1.6 : 1))));
      this.rainWaves.set(`${skill.id}:${index}`, this.fallingRain(ctx, area, kind, count, strike.atMs));
    }
  }

  /** Called immediately before applyHits; all ground and monster impacts start together. */
  landRain(skill: SkillDef, index: number): boolean {
    const key = `${skill.id}:${index}`, wave = this.rainWaves.get(key);
    if (!wave) return false;
    for (const rain of wave) rain.land();
    this.rainWaves.delete(key);
    return true;
  }

  private fallingRain(ctx: SkillFxContext, area: Rect, kind: 'sword' | 'arrow', count: number, impactAtMs?: number): FallingRain[] {
    const wave: FallingRain[] = [];
    const left = Math.max(area.x, ctx.bounds.x), right = Math.min(area.x + area.w, ctx.bounds.x + ctx.bounds.w);
    if (right <= left) return wave;
    const top = Math.max(ctx.bounds.y - 120, Math.min(ctx.view.y, area.y) - 100);
    for (let i = 0; i < count; i++) {
      // Stratified spacing keeps a readable curtain without stacks of identical weapons.
      const x = left + (i + rand(.15, .85)) / count * (right - left);
      const fallback = ctx.rainTerrain ? null : ctx.groundAt(x, top);
      const surface = ctx.rainTerrain ? firstRainSurface(ctx.rainTerrain, x, top) : fallback === null ? null : { y: fallback, slope: 0 };
      // Bounded even when several strikes or dev casts overlap.
      if (this.rains.size >= 128) this.rains.values().next().value?.destroy();
      const rain = new FallingRain(this.scene, { kind, x, top, surface,
        exitY: ctx.view.y + ctx.view.h + 300,
        height: kind === 'sword' ? rand(224, 260) : rand(166, 196),
        delay: rand(0, kind === 'sword' ? 210 : 160),
        embedRatio: kind === 'sword' ? rand(.34, .49) : rand(.42, .57),
        impactAtMs,
      }, () => this.rains.delete(rain));
      this.rains.add(rain);
      wave.push(rain);
    }
    return wave;
  }

  /** 扇形散射：箭或飛刃從胸前向前張開（距離 = 判定半徑）。 */
  private fan(ctx: SkillFxContext, fxId: string, count: number): void {
    const distance = (ctx.area?.w ?? 500) / 2;
    const spread = fxId === 'shuriken' ? 0.7 : 0.45;
    const x = ctx.x + ctx.facing * 10;
    const y = ctx.y - CHEST;
    const color=fxId==='shuriken'?0xff4567:0xffd377;
    this.kit.burst(x,y,color,.8,12,ctx.facing===1?0:Math.PI);
    for (let i = 0; i < count; i += 1) {
      const a = (ctx.facing === 1 ? 0 : Math.PI) - spread + (2 * spread * i) / (count - 1);
      const item = this.fxSprite(fxId, x, y);
      if (!item) continue;
      item.setDisplaySize(fxId==='shuriken'?76:155,fxId==='shuriken'?76:39);
      orientSkillWeapon(item,a);
      const trail=this.gfx(x,y).setRotation(a);
      trail.fillStyle(color,.35).fillTriangle(-50,-2,-50,2,12,0);
      this.fade(trail,240,{x:x+Math.cos(a)*distance,y:y+Math.sin(a)*distance});
      this.scene.tweens.add({targets:item,x:x+Math.cos(a)*distance,y:y+Math.sin(a)*distance,duration:240});
      this.fade(item,90,{},210);
    }
  }

  /** One contact burst per completed revolution; live monster positions, no extra damage. */
  private followBlade(blade:Phaser.GameObjects.Sprite,ctx:SkillFxContext,power:number,color:number,period:number,quiet=false):void {
    let tick=0;
    const timer=this.scene.time.addEvent({delay:period,loop:true,callback:()=>{
      if(!blade.active||blade.alpha<.15)return;
      const ghost=this.track(this.scene.add.sprite(blade.x,blade.y,blade.texture.key,blade.frame.name)).setDepth(DEPTH.fx-1).setDisplaySize(blade.displayWidth,blade.displayHeight).setRotation(blade.rotation).setTint(color).setAlpha(.1);
      this.fade(ghost,period*.65);
      const contacts=ctx.targetsAt?.(blade.x,blade.y,blade.displayWidth*.45)??[];
      for(const p of contacts.slice(0,2))this.goldContact(p);
      if(++tick%3===0&&!quiet){
        const ground=ctx.groundAt(blade.x,blade.y)??ctx.y;
        if(Math.abs(ground-blade.y)<100)this.kit.smoke(blade.x,ground,0x65505c,power);
      }
    }});
    blade.once(Phaser.GameObjects.Events.DESTROY,()=>timer.remove());
  }

  private bladeContact(p:FxPoint,color:number,power:number):void {
    this.sequence('rend',p.x,p.y,120+power*50).setTint(color).setAlpha(.85).setAngle(rand(-35,35));
    this.kit.burst(p.x,p.y,color,power,5);
  }

  private archerContact(p:FxPoint,angle:number,power:number,fire=false,particles=true):void {
    this.sequence(fire?'archerFireHit':'archerHit',p.x,p.y,126+power*32).setRotation(angle).setDepth(DEPTH.fx+2);
    if(particles){
      this.kit.glow(p.x,p.y,fire?0xffc076:0xfff0b6,48+power*18,90,.65);
      this.kit.burst(p.x,p.y,fire?0xffa451:0x9ce8d8,.35+power*.15,4,angle);
    }
  }

  private goldContact(p:FxPoint,confirmedHit=false):void {
    const now=this.scene.time.now;
    this.goldContacts=this.goldContacts.filter(hit=>now-hit.at<90);
    if(!confirmedHit&&this.goldContacts.some(hit=>Math.hypot(hit.x-p.x,hit.y-p.y)<28))return;
    this.goldContacts.push({...p,at:now});
    this.sequence('goldHit',p.x,p.y,140).setAngle(rand(-20,20));
  }

  /** Retarget every frame so a moving player catches the returning blade. */
  private returnBlade(blade:Phaser.GameObjects.Sprite,ctx:SkillFxContext,duration=520):void {
    const start={x:blade.x,y:blade.y},progress={t:0};
    const tween=this.scene.tweens.add({targets:progress,t:1,duration,ease:'Sine.InOut',onUpdate:()=>{
      const end=ctx.playerAt?.()??{x:ctx.x,y:ctx.y-CHEST};
      blade.setPosition(start.x+(end.x-start.x)*progress.t,start.y+(end.y-start.y)*progress.t-Math.sin(progress.t*Math.PI)*42);
    },onComplete:()=>{this.kit.glow(blade.x,blade.y,0xbeeaff,65,140,.4);this.fade(blade,100);}});
    blade.once(Phaser.GameObjects.Events.DESTROY,()=>tween.stop());
  }

  /** 影襲：從上一個位置到這裡一道暗影，在目標身上交叉斬。 */
  private shadowSlash(ctx: SkillFxContext): void {
    if (ctx.from) {
      const g = this.gfx(0, 0);
      g.lineStyle(10, 0x5b3a8c, 0.45).lineBetween(ctx.from.x, ctx.from.y - CHEST, ctx.x, ctx.y - CHEST);
      g.lineStyle(2, 0xe0c8ff, 0.9).lineBetween(ctx.from.x, ctx.from.y - CHEST, ctx.x, ctx.y - CHEST);
      this.fade(g, 220);
    }
    for (const t of ctx.targets) this.xSlash(t.x, t.y, 24, 0x8f5bd6);
  }

  /** 疾風連斬：衝刺路線上的斜斬痕。 */
  private pathSlash(ctx: SkillFxContext): void {
    const from = ctx.origin ?? { x: ctx.x - ctx.facing * 200, y: ctx.y };
    const y = ctx.y - CHEST;
    const steps = Math.min(8,Math.max(4, Math.round(Math.abs(ctx.x - from.x) / 75)));
    for (let i = 0; i < steps; i += 1) {
      const x = from.x + ((ctx.x - from.x) * (i + 0.5)) / steps;
      this.sequence('shadow',x,y,175,i*18).setAlpha(.8).setFlipX(ctx.facing===-1);
    }
    for(const t of ctx.targets.slice(0,5))this.bladeContact(t,0xc7a0ff,.8);
    this.kit.smoke(ctx.x,ctx.y,0x675580,.8);
  }

  /** 迴旋刃（cue）：大飛刃飛出去再飛回來（距離 = 技能射程）。 */
  private boomerang(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 12;
    const y = ctx.y - CHEST;
    const blade=this.track(createSkillWeapon(this.scene,'crescent',x,y,150));
    this.followBlade(blade,ctx,.7,0x8dffb6,bladeSpinMs('crescent'));
    // 600 ms outward, 180 ms at the far edge, 600 ms returning.
    this.scene.tweens.add({targets:blade,x:x+ctx.facing*ctx.reach,duration:600,hold:180,ease:'Sine.InOut',yoyo:true,
      onUpdate:(tween)=>{blade.y=y-Math.sin(tween.progress*Math.PI)*20;},
      onComplete:()=>this.fade(blade,100)});
  }

  // ---------------------------------------------------------------------------
  // 大絕招：全地圖判定，視野內保留清楚的演出層次
  // ---------------------------------------------------------------------------

  /** 全畫面閃一下。 */
  private skyFlash(color: number): void {
    const camera=this.scene.cameras.main,view=camera.worldView;
    this.kit.veil(0x101629,300,.18);
    this.kit.glow(view.centerX,view.centerY,color,Math.min(view.width,900),180,.25);
  }

  /** 聖劍斬（cue）：巨大的金色劍氣從角色往左右兩邊飛到地圖盡頭。 */
  private holyWave(ctx: SkillFxContext): void {
    const r = 190;
    const y = ctx.y - CHEST - 20;
    const duration = 520;
    for (const dir of [1, -1] as const) {
      const distance = dir === 1 ? ctx.bounds.x + ctx.bounds.w - ctx.x : ctx.x - ctx.bounds.x;
      const wave = this.crescent(ctx.x + dir * 10, y, r, dir, dir * distance, duration, 0xffe08a);
      const trail = this.scene.time.addEvent({
        delay: 40,
        repeat: Math.floor(duration / 40) - 1,
        callback: () => {
          const ghost = this.gfx(wave.x, wave.y);
          drawCrescent(ghost, r * 0.95, dir, 0xfff1c8, 0.25);
          this.fade(ghost, 200);
        },
      });
      wave.once(Phaser.GameObjects.Events.DESTROY, () => trail.remove());
    }
    this.flash(ctx.x, y, 0xffe08a, 300, 2.6, 320);
    this.skyFlash(0xfff1c8);
  }

  /** 天劍降臨：巨劍從天而降插滿整張地圖的地面。 */
  private swordRain(ctx: SkillFxContext): void {
    this.fallingRain(ctx, ctx.view, 'sword', Math.min(22, Math.max(1, Math.round(ctx.view.w / 115))));
    this.targetCuts(ctx, 0xfff1c8);
  }

  /** 隕石天降：整張地圖各處落下隕石，撞地爆炸。 */
  private meteorShower(ctx: SkillFxContext): void {
    const area = ctx.view;
    const count = Math.max(4, Math.min(10, Math.round(area.w / 260)));
    for (let i = 0; i < count; i += 1) {
      const x = area.x + ((i + Math.random()) / count) * area.w;
      const land = ctx.groundAt(x, area.y + rand(0, area.h * 0.6)) ?? ctx.y;
      this.fallingMeteor(x - 160, land - 420, x, land - 10, 180 + rand(0, 140), rand(0.9, 1.5), true);
    }
  }

  /** 死神召喚（cue）：前方地面出現法陣與光柱，持續到技能結束。 */
  private summonCircle(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 200;
    const ground = ctx.groundAt(x, ctx.y - 40) ?? ctx.y;
    this.sequence('arcane',x,ground-12,245).setDisplaySize(245,85).setTint(0xc298ff);
    const circle = this.gfx(x, ground - 4);
    circle.lineStyle(3, 0xb07cff, 0.9).strokeCircle(0, 0, 110).strokeCircle(0, 0, 84);
    const star = [0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.cos((i / 6) * Math.PI * 2) * 84, y: Math.sin((i / 6) * Math.PI * 2) * 84 }));
    circle.lineStyle(2, 0xe0c8ff, 0.9).strokeTriangle(star[0]!.x, star[0]!.y, star[2]!.x, star[2]!.y, star[4]!.x, star[4]!.y);
    circle.strokeTriangle(star[1]!.x, star[1]!.y, star[3]!.x, star[3]!.y, star[5]!.x, star[5]!.y);
    circle.setScale(0.2, 0.07);
    this.scene.tweens.add({ targets: circle, scaleX: 1, scaleY: 0.35, duration: 260, ease: 'Back.Out' });
    // Keep the seal horizontal on the ground; rotating a squashed object tilts the entire plane.
    this.fade(circle, 300, {}, ctx.remainingMs);
    this.kit.glow(x,ground-120,0x9b6bff,310,650,.45);
    this.kit.burst(x,ground-8,0xc79dff,2,24,-Math.PI/2);
    this.flash(x, ground - 60, 0xb07cff, 240, 2.2, ctx.remainingMs);
  }

  /** 死神（cue）：巨大的死神從法陣升起，舉著鐮刀，等下一刀時揮出。 */
  private reaper(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 200;
    const ground = ctx.groundAt(x, ctx.y - 40) ?? ctx.y;
    this.kit.veil(0x160b2c,650,.32);
    this.kit.smoke(x,ground,0x573079,3);
    this.activeReaper?.destroy();
    const reaper=this.track(this.scene.add.sprite(x,ground+8,atlasKey('reaper'),0))
      .setOrigin(.5,1).setDepth(DEPTH.fx-1).setFlipX(ctx.facing===-1).setDisplaySize(360,360);
    this.activeReaper=reaper;
    reaper.once(Phaser.GameObjects.Events.DESTROY,()=>{if(this.activeReaper===reaper)this.activeReaper=null;});
    reaper.play({key:`${atlasKey('reaper')}-summon`,duration:Math.max(120,ctx.leadMs)});
    // The strike callbacks advance the poses. Hit stop cannot make the scythe swing early.
    // Fallback cleanup also covers interrupted/cancelled skills.
    this.fade(reaper,180,{},ctx.remainingMs+700);
  }

  /** 死神揮鐮：一道橫跨畫面的暗紫弧光，整張地圖的怪身上都出現斬痕。 */
  private reaperSweep(ctx: SkillFxContext): void {
    this.reaperBeat++;
    this.activeReaper?.play({key:`${atlasKey('reaper')}-sweep`,duration:190});
    const view = ctx.view;
    const g = this.gfx(view.x + view.w / 2, ctx.y + 90);
    drawBladeArc(g,view.w*.55,Math.PI*1.08,Math.PI*1.92,0xb17bff,28);
    g.setScale(1,this.reaperBeat%2?.35:.48).setAlpha(.85);
    this.fade(g, 260, { scaleY:.45 });
    for (const t of ctx.targets)this.soulRift(t.x,t.y,1);
    this.skyFlash(0x8f5bd6);
  }

  /** 死神爆發：畫面蒙上暗紫，整張地圖的怪身上都炸開。 */
  private darkBurst(ctx: SkillFxContext): void {
    this.kit.endCinematic();
    const reaper=this.activeReaper;
    if(reaper){reaper.play(`${atlasKey('reaper')}-dissolve`);this.fade(reaper,260);}
    const view = ctx.view;
    const veil = this.gfx(view.x, view.y, false);
    veil.fillStyle(0x2a0f45, 0.45).fillRect(0, 0, view.w, view.h);
    this.fade(veil, 420);
    for (const p of ctx.targets) {
      this.soulRift(p.x,p.y,1.8);
      this.kit.burst(p.x,p.y,0xb685ff,.9,8);
      this.ring(p.x, p.y, 6, 46, 0xe0c8ff, 3, 300);
    }
    this.skyFlash(0xb07cff);
  }

  /** 萬箭齊發（cue）：往天上射出一排箭。 */
  private arrowVolley(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 8;
    const y = ctx.y - 34;
    for (let i = 0; i < 11; i += 1) {
      const arrow = this.fxSprite('arrow', x, y);
      if (!arrow) continue;
      const a = -Math.PI / 2 + (i - 5) * 0.12;
      orientSkillWeapon(arrow,a);
      arrow.setDisplaySize(175,44);
      this.fade(arrow, 260, { x: x + Math.cos(a) * 460, y: y + Math.sin(a) * 460 }, i * 15);
    }
    this.skyFlash(0xfff1c8);
  }

  /** 流星神箭（cue）：一支巨大的光箭飛到地圖盡頭，後面拖著火光。 */
  private comet(ctx: SkillFxContext): void {
    const y = ctx.y - CHEST;
    const start = ctx.x + ctx.facing * 20;
    const end = ctx.facing === 1 ? ctx.bounds.x + ctx.bounds.w : ctx.bounds.x;
    const head=this.track(createSkillWeapon(this.scene,'fireArrow',start,y,330));
    orientSkillWeapon(head,ctx.facing===1?0:Math.PI);
    const duration = 460;
    let trailAt=0;
    this.scene.tweens.add({
      targets: head,
      x: end,
      duration,
      onUpdate: () => {
        if(this.scene.time.now-trailAt<24)return;
        trailAt=this.scene.time.now;
        this.kit.glow(head.x,head.y,0xffcd7d,110,110,.4);
        this.kit.burst(head.x-ctx.facing*45,head.y,0xffd087,.65,4,ctx.facing===1?Math.PI:0);
        this.kit.trail(head.x-ctx.facing*35,head.y,0xffefb9,0,false);
      },
      onComplete: () => this.fade(head, 120),
    });
    this.flash(start, y, 0xffe08a, 260, 2.6, duration);
    this.skyFlash(0xffe08a);
  }

  /** 流星神箭：每隻被打中的怪身上爆開。 */
  private cometBurst(ctx: SkillFxContext): void {
    for (const t of ctx.targets.slice(0, 12)) this.phoenixBurst(t.x,t.y,1.3);
  }

  /** 分身飛鏢：一支飛鏢分裂成好幾支大飛鏢，飛到地圖各處的散射點後在原地狂轉，持續到技能結束。 */
  private shurikenStorm(ctx: SkillFxContext): void {
    const x = ctx.x + ctx.facing * 14;
    const y = ctx.y - CHEST;
    for (const p of ctx.points) {
      const blade = this.track(createSkillWeapon(this.scene,'split',x,y,152));
      blade.setDisplaySize(152,152);
      this.scene.tweens.add({ targets: blade, x: p.x, y: p.y, duration: 260, hold:Math.max(0,ctx.remainingMs-250-260),ease:'Sine.Out',onComplete:()=>this.returnBlade(blade,ctx) });
      this.followBlade(blade,ctx,.5,0xffd481,bladeSpinMs('fuma'),true);
    }
    this.ring(x, y, 6, 50, 0xbff0ff, 3, 220);
  }

  /** 影分身：從角色身上飛出好幾個影子，衝到地圖各處的散射點，持續到技能結束。 */
  private shadowClones(ctx: SkillFxContext): void {
    if (!ctx.frame) return;
    for (const p of ctx.points) {
      const side: 1 | -1 = p.x >= ctx.x ? 1 : -1;
      const clone = this.afterimage(ctx.frame, ctx.x, ctx.y, side, 0x3a1d66, 0.9, ctx.remainingMs + 200);
      clone.setBlendMode(Phaser.BlendModes.NORMAL);
      this.scene.tweens.add({ targets: clone, x: p.x, y: p.y + 24, duration: 220, ease: 'Quad.Out' });
      const trail = this.gfx(0, 0);
      trail.lineStyle(8, 0x5b3a8c, 0.4).lineBetween(ctx.x, ctx.y - CHEST, p.x, p.y);
      this.fade(trail, 260);
    }
  }

  /** 影分身：每個點上交叉斬。 */
  private cloneSlash(ctx: SkillFxContext): void {
    for (const p of ctx.points) this.xSlash(p.x + rand(-12, 12), p.y + rand(-12, 12), 32, 0x8f5bd6, false);
  }

  /** 散射點上的環（分身飛鏢旋轉中）。 */
  private pointRings(ctx: SkillFxContext): void {
    for(const p of ctx.targets.slice(0,8))this.goldContact(p);
  }

  /** 每隻被打中的怪身上一道斬痕（全地圖技能）。 */
  private targetCuts(ctx: SkillFxContext, color: number): void {
    for (const t of ctx.targets.slice(0, 30)) this.cut(t.x, t.y, 28, color);
  }

  // ---------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    if(this.objects.size>=VFX_BUDGET.ornaments)this.objects.values().next().value?.destroy();
    this.objects.add(object);
    object.once(Phaser.GameObjects.Events.DESTROY, () => { this.scene.tweens.killTweensOf(object); this.objects.delete(object); });
    return object;
  }

  private gfx(x: number, y: number, additive = true): Phaser.GameObjects.Graphics {
    const g = this.track(this.scene.add.graphics({ x, y })).setDepth(DEPTH.fx);
    if (additive) g.setBlendMode(Phaser.BlendModes.ADD);
    return g;
  }

  private sequence(name: Exclude<SkillAtlasName,'reaper'|'tiger'>,x:number,y:number,size:number,delay=0): Phaser.GameObjects.Sprite {
    const sprite=this.track(this.scene.add.sprite(x,y,atlasKey(name),0)).setDepth(DEPTH.fx).setDisplaySize(size,size);
    sprite.play({key:`${atlasKey(name)}-burst`,delay});
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE,()=>sprite.destroy());
    // Last frames contain lingering smoke; fade them smoothly before recycling.
    this.fade(sprite,120,{},BURST_DURATION[name]-120+delay);
    return sprite;
  }

  private fxSprite(id: string, x: number, y: number): Phaser.GameObjects.Sprite | null {
    if(id==='arrow'||id==='shuriken')return this.track(createSkillWeapon(this.scene,id==='arrow'?'arrow':'fuma',x,y,id==='arrow'?150:124));
    const asset = this.bundle.fx.get(id);
    if (!asset || !this.scene.textures.exists(asset.path)) return null;
    return this.track(this.scene.add.sprite(x, y, asset.path, frameName(null, 0))).setDepth(DEPTH.fx);
  }

  private fade(object: Phaser.GameObjects.GameObject, duration: number, props: Record<string, number> = {}, delay = 0): void {
    this.scene.tweens.add({ targets: object, alpha: 0, ...props, duration, delay, onComplete: () => object.destroy() });
  }

  private ring(x: number, y: number, from: number, to: number, color: number, width: number, duration: number, squash = 1): void {
    const g = this.gfx(x, y);
    g.lineStyle(width, color, 0.7).strokeCircle(0, 0, to);
    g.lineStyle(1,0xffffff,.7).strokeCircle(0,0,to*.97);
    g.setScale(from/to,from/to*squash);
    this.scene.tweens.add({targets:g,scaleX:1,scaleY:squash,alpha:0,duration,ease:'Cubic.Out',onComplete:()=>g.destroy()});
  }

  /** 月牙劍氣：從 x 往前飛 dx，飛完淡出。 */
  private crescent(x: number, y: number, r: number, facing: 1 | -1, dx: number, duration: number, color: number): Phaser.GameObjects.Graphics {
    const blade=this.sequence('blade',x,y,r*3).setFlipX(bladeFlipX(facing));
    blade.anims.timeScale=320/Math.max(320,duration);
    this.scene.tweens.killTweensOf(blade);this.fade(blade,120,{},Math.max(200,duration-80));
    this.scene.tweens.add({targets:blade,x:x+dx,duration});
    const g = this.gfx(x, y);
    drawCrescent(g, r, facing, color, .35);
    this.scene.tweens.add({ targets: g, x: x + dx, duration });
    this.fade(g, 160, {}, Math.max(0, duration - 80));
    return g;
  }

  /** 斜的一刀（白芯 + 色光）。 */
  private cut(x: number, y: number, size: number, color: number): void {
    this.sequence('blade',x,y,size*3).setTint(color).setAngle(-25);
    const g = this.gfx(x, y);
    g.lineStyle(3, 0xffffff, 1).lineBetween(-size, size * 0.66, size, -size * 0.66);
    g.lineStyle(9, color, 0.4).lineBetween(-size * 1.1, size * 0.72, size * 1.1, -size * 0.72);
    g.setScale(0.2, 1);
    this.fade(g, 300, { scaleX: 1.2 });
  }

  private xSlash(x: number, y: number, size: number, color: number, light = true): void {
    this.sequence('shadow',x,y,size*3.6);
    const g = this.gfx(x, y);
    g.lineStyle(7, color, 0.45).lineBetween(-size, -size, size, size).lineBetween(-size, size, size, -size);
    g.lineStyle(2, 0xffffff, 1).lineBetween(-size * 0.9, -size * 0.9, size * 0.9, size * 0.9).lineBetween(-size * 0.9, size * 0.9, size * 0.9, -size * 0.9);
    g.setScale(0.3);
    this.fade(g, 260, { scale: 1.2 });
    if (light) this.flash(x, y, 0xc59bff, 100, 1.4, 200);
  }

  /** 火球從 (x0,y0) 落到 (x1,y1)，撞地時可以順便爆炸。 */
  private fallingMeteor(x0: number, y0: number, x1: number, y1: number, duration: number, scale: number, explodeOnImpact = false): void {
    this.kit.glow(x1,y1,0xff9a54,120*scale,duration,.45);
    const ball=this.track(this.scene.add.sprite(x0,y0,atlasKey('fire'),1)).setDepth(DEPTH.fx).setDisplaySize(95*scale,95*scale);
    ball.play({key:`${atlasKey('fire')}-burst`,repeat:-1});
    ball.setRotation(Math.atan2(y1-y0,x1-x0)-Math.PI/2);
    let trailAt=0;
    this.scene.tweens.add({
      targets: ball,
      x: x1,
      y: y1,
      duration,
      ease: 'Quad.In',
      onUpdate: () => {
        if(this.scene.time.now-trailAt<32)return;
        trailAt=this.scene.time.now;
        this.kit.burst(ball.x,ball.y,0xffb36c,.4*scale,3,Math.atan2(y0-y1,x0-x1));
      },
      onComplete: () => {
        ball.destroy();
        if (explodeOnImpact) this.explosion(x1, y1 + 10, 1.4 * scale, 0xffa040);
      },
    });
  }

  private bolt(x1: number, y1: number, x2: number, y2: number, color: number, duration: number): void {
    const points = jagged(x1, y1, x2, y2, 9, 14);
    const g = this.gfx(0, 0);
    g.lineStyle(18, color, 0.08).strokePoints(points);
    g.lineStyle(7, color, 0.35).strokePoints(points);
    g.lineStyle(2, 0xffffff, 1).strokePoints(points);
    for(const i of [2,5,7]){const p=points[i]!;g.lineStyle(1,color,.65).strokePoints(jagged(p.x,p.y,p.x+rand(-48,48),p.y-35,4,8));}
    this.scene.tweens.add({ targets: g, alpha: 0.2, duration: 45, yoyo: true, repeat: 1 });
    this.fade(g, 120, {}, duration - 120);
  }

  private randomPoints(area: Rect | null, count: number, fallbackY: number): FxPoint[] {
    if (!area) return [];
    return Array.from({ length: count }, () => ({ x: area.x + rand(0, area.w), y: Math.min(fallbackY, area.y + area.h) }));
  }

  /** 光源閃一下（關閉光影或光源太多時略過）。 */
  private flash(x: number, y: number, color: number, radius: number, intensity: number, duration: number): Phaser.GameObjects.Light | null {
    if (!this.lit()) return null;
    const lights = this.scene.lights;
    if (lights.getLightCount() >= VFX_BUDGET.lights) return null;
    const light = lights.addLight(x, y, radius, color, intensity);
    this.lights.add(light);
    this.scene.tweens.add({
      targets: light,
      intensity: 0,
      duration,
      onComplete: () => {
        lights.removeLight(light);
        this.lights.delete(light);
      },
    });
    return light;
  }
}

/** 月牙：朝 facing 方向凸出的弧（粗光暈 + 白色刀芯）。 */
function drawCrescent(g: Phaser.GameObjects.Graphics, r: number, facing: 1 | -1, color: number, alpha: number): void {
  const a = facing === 1 ? 0 : Math.PI;
  drawBladeArc(g,r,a-1.4,a+1.2,color,Math.max(12,r*.25),alpha);
}

/** 尖尾月牙：厚度沿弧線變化，內外輪廓與光芯各一層，不把等寬線放大成粗圈。 */
function drawBladeArc(g: Phaser.GameObjects.Graphics,r:number,start:number,end:number,color:number,width:number,alpha=1):void {
  for(const [scale,tint,opacity] of [[1.7,color,.12],[1,color,.65],[.22,0xffffff,.95]]) {
    const outer:{x:number;y:number}[]=[],inner:{x:number;y:number}[]=[];
    for(let i=0;i<=28;i++) {
      const t=i/28,a=start+(end-start)*t;
      const w=Math.pow(Math.sin(t*Math.PI),.75)*width*scale!;
      outer.push({x:Math.cos(a)*(r+w*.15),y:Math.sin(a)*(r+w*.15)});
      inner.unshift({x:Math.cos(a)*(r-w),y:Math.sin(a)*(r-w)});
    }
    g.fillStyle(tint!,opacity!*alpha).fillPoints([...outer,...inner].map(p=>new Phaser.Math.Vector2(p.x,p.y)),true);
  }
  g.lineStyle(1,color,.4*alpha).beginPath().arc(0,0,r*1.08,start+.2,end-.2).strokePath();
}

/** 兩點之間的鋸齒線（閃電）。 */
function jagged(x1: number, y1: number, x2: number, y2: number, segments: number, jitter: number): Phaser.Math.Vector2[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const points = [new Phaser.Math.Vector2(x1, y1)];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const offset = rand(-jitter, jitter);
    points.push(new Phaser.Math.Vector2(x1 + (x2 - x1) * t + nx * offset, y1 + (y2 - y1) * t + ny * offset));
  }
  points.push(new Phaser.Math.Vector2(x2, y2));
  return points;
}
