import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Canvas } from './raster';
import { writeJson, writePng, writeSheet, type SheetFrame } from './sheet';

/** 美術獨立交付：不修改共用 AvatarTag、技能、碰撞或移動程式。 */
const directory = fileURLToPath(new URL('../../../assets/verdant/motions/', import.meta.url));
const SIZE = 128;
const ROOT = { x: 64, y: 120 };
type Point = readonly [number, number];
type Motion = { id: string; label: string; classId: string; timing: number[]; release?: number; airborne?: boolean };
type Source = { name: string; motions: [Motion, Motion]; hips: number[]; spinY?: number[] };
const sources: Source[] = [
  { name: 'spin-draw', hips: [174,478,789,1084,163,477,785,1096,172,488,792,1097,179,494,803,1100],
    spinY: [242,266,220,216,516,530,568,550], motions: [
      { id: 'jump_spin', label: '原地旋轉跳躍', classId: 'warrior', timing: [90,100,80,80,80,80,90,120], airborne: true },
      { id: 'draw_slash', label: '拔刀斬', classId: 'warrior', timing: [90,100,140,70,50,70,90,120], release: 4 },
    ] },
  { name: 'slashes', hips: [167,478,787,1107,206,524,833,1128,168,467,789,1098,184,476,816,1124], motions: [
      { id: 'slash_horizontal', label: '橫斬', classId: 'warrior', timing: [80,80,110,55,50,70,90,120], release: 4 },
      { id: 'slash_rising', label: '上挑斬', classId: 'warrior', timing: [80,90,110,55,50,80,100,120], release: 4 },
    ] },
  { name: 'heavy-thrust', hips: [168,491,787,1090,183,506,820,1125,166,481,802,1112,191,513,816,1125], motions: [
      { id: 'cleave_heavy', label: '雙手重劈', classId: 'warrior', timing: [80,100,110,150,55,90,110,120], release: 4 },
      { id: 'thrust', label: '定點突刺', classId: 'warrior', timing: [80,100,100,60,55,80,90,120], release: 4 },
    ] },
  { name: 'mage', hips: [175,490,804,1112,174,489,805,1120,175,488,802,1111,213,534,808,1122], motions: [
      { id: 'mage_cast', label: '聚能施法', classId: 'mage', timing: [80,100,130,100,70,90,100,120], release: 4 },
      { id: 'mage_staff_burst', label: '法杖爆發', classId: 'mage', timing: [80,100,110,140,65,90,110,120], release: 4 },
    ] },
  { name: 'archer', hips: [149,459,780,1099,163,481,778,1094,150,465,783,1110,171,482,784,1100], motions: [
      { id: 'archer_aimed_shot', label: '拉弓蓄力射擊', classId: 'archer', timing: [80,100,90,110,160,65,90,120], release: 5 },
      { id: 'archer_quick_shot', label: '快速接續射擊', classId: 'archer', timing: [60,65,65,90,50,60,70,100], release: 4 },
    ] },
  { name: 'assassin-v2', hips: [146,470,787,1095,160,475,787,1083,145,472,778,1092,173,482,785,1083], motions: [
      { id: 'assassin_dual_slash', label: '雙刃連斬', classId: 'assassin', timing: [70,95,50,65,50,80,90,120], release: 2 },
      { id: 'assassin_throw', label: '飛刃投擲', classId: 'assassin', timing: [70,90,110,55,50,80,100,120], release: 4 },
    ] },
];

function readSource(name: string): Canvas {
  const png = PNG.sync.read(fs.readFileSync(path.join(directory, `hero-motion-${name}.png`)));
  const result = new Canvas(png.width, png.height);
  result.data.set(png.data);
  return result;
}

export function cellsOf(image: Canvas) {
  // 刀尖與披風可跨過名義格線；以連通主體分離，避免切斷武器。
  const visited=new Uint8Array(image.width*image.height);
  const groups: { pixels:number[];x:number;y:number;w:number;h:number }[]=[];
  for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
    const start=y*image.width+x;
    if(visited[start] || image.alpha(x,y)<8) continue;
    visited[start]=1;
    const pixels=[start];let minX=x,maxX=x,minY=y,maxY=y;
    for(let i=0;i<pixels.length;i++) {
      const p=pixels[i]!,px=p%image.width,py=Math.floor(p/image.width);
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=px+dx,ny=py+dy,np=ny*image.width+nx;
        if(!image.inside(nx,ny)||visited[np]||image.alpha(nx,ny)<8)continue;
        visited[np]=1;pixels.push(np);
      }
    }
    if(pixels.length>4)groups.push({pixels,x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1});
  }
  const major=groups.filter(g=>g.pixels.length>2500);
  if(major.length!==16)throw new Error(`預期 16 個角色主體，實際 ${major.length}；大小 ${major.map(g=>g.pixels.length)}`);
  major.sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2));
  const ordered=[0,1,2,3].flatMap(row=>major.slice(row*4,row*4+4).sort((a,b)=>a.x-b.x));
  // 小塊像素（髮尖、高光、魔法亮點）歸到最近的主體，保留原始 alpha。
  for(const minor of groups.filter(g=>g.pixels.length<=2500)) {
    const cx=minor.x+minor.w/2,cy=minor.y+minor.h/2;
    const nearest=[...ordered].sort((a,b)=>Math.hypot(cx-a.x-a.w/2,cy-a.y-a.h/2)-Math.hypot(cx-b.x-b.w/2,cy-b.y-b.h/2))[0]!;
    nearest.pixels.push(...minor.pixels);
  }
  return ordered.map(g=>{
    const xs=g.pixels.map(p=>p%image.width),ys=g.pixels.map(p=>Math.floor(p/image.width));
    const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x+1,h=Math.max(...ys)-y+1;
    const canvas=new Canvas(w,h);
    for(const p of g.pixels)canvas.set(p%image.width-x,Math.floor(p/image.width)-y,image.get(p%image.width,Math.floor(p/image.width)));
    return {x,y,w,h,canvas};
  });
}

/** 固定倍率、alpha 加權面積採樣；僅切格與對齊，沒有改畫原始角色。 */
export function stamp(target: Canvas, source: Canvas, offset: Point, scale: number): void {
  const w = Math.ceil(source.width * scale), h = Math.ceil(source.height * scale);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    let r=0,g=0,b=0,a=0,n=0;
    for(let sy=Math.floor(y/scale);sy<Math.min(source.height,Math.ceil((y+1)/scale));sy++) {
      for(let sx=Math.floor(x/scale);sx<Math.min(source.width,Math.ceil((x+1)/scale));sx++) {
        const pixel=source.get(sx,sy); r+=pixel[0]*pixel[3];g+=pixel[1]*pixel[3];b+=pixel[2]*pixel[3];a+=pixel[3];n++;
      }
    }
    if(a) target.set(offset[0]+x,offset[1]+y,[Math.round(r/a),Math.round(g/a),Math.round(b/a),Math.round(a/n)]);
  }
}

export function writeHeroMotions(out = path.join(directory, 'export')): void {
  const frames: SheetFrame[] = [];
  const tags: { name: string; from: number; to: number }[] = [];
  const clips: object[] = [];
  const filmstrip = new Canvas(SIZE * 8, SIZE * sources.length * 2);
  const ready = new Map<string,Canvas>();
  const readyRegistration = new Map<string,object>();
  for (const source of sources) {
    const image = readSource(source.name);
    const cells = cellsOf(image);
    const first = cells[0]!;
    const neutral = first.canvas.bounds()!;
    // 森境旅人的原有站姿高度為 62px；整張原畫只使用一個倍率。
    const scale = 62 / neutral.h;
    for (let action=0;action<2;action++) {
      const motion = source.motions[action]!;
      const from = frames.length;
      const contacts: object[] = [];
      for(let i=0;i<8;i++) {
        const cellIndex=action*8+i, cell=cells[cellIndex]!;
        const crop=cell.canvas;
        const bounds=crop.bounds();
        if(!bounds) throw new Error(`${motion.id}:${i} 空白幀`);
        const hipX=source.hips[cellIndex]! * image.width / 1254;
        // 地面動作對齊腳底，空中旋轉對齊骨盆；跳躍弧線由遊戲程式處理。
        const anchorY=motion.airborne ? source.spinY![i]! * image.height / 1254 : cell.y+bounds.y+bounds.h-1;
        const targetY=motion.airborne ? 102 : ROOT.y;
        const offset: Point=[Math.round(ROOT.x-(hipX-cell.x)*scale),Math.round(targetY-(anchorY-cell.y)*scale)];
        let canvas=new Canvas(SIZE,SIZE);
        stamp(canvas,crop,offset,scale);
        let registration: object={sourceImage:`hero-motion-${source.name}.png`,sourceFrame:cellIndex,
          sourceCell:{x:cell.x,y:cell.y,w:cell.w,h:cell.h},registration:{x:hipX,y:anchorY},registrationTarget:{x:ROOT.x,y:targetY},scale};
        // 同職業共用精確相同的首尾待機像素，避免換招時造型抖動。
        if (!ready.has(motion.classId) && i===0) {ready.set(motion.classId,canvas);readyRegistration.set(motion.classId,registration);}
        if (i===0 || i===7) {canvas=ready.get(motion.classId)!;registration=readyRegistration.get(motion.classId)!;}
        const box=canvas.bounds()!;
        if(box.x<1 || box.y<1 || box.x+box.w>=SIZE || box.y+box.h>=SIZE) throw new Error(`${motion.id}:${i} 接觸畫布邊緣`);
        const frameIndex=frames.length;
        frames.push({layer:null,index:frameIndex,canvas,durationMs:motion.timing[i]!});
        filmstrip.draw(canvas,i*SIZE,(tags.length)*SIZE);
        contacts.push({ frame: frameIndex, root: ROOT, rootMotion: {x:0,y:0}, ...registration });
      }
      tags.push({name:motion.id,from,to:frames.length-1});
      clips.push({...motion,from,to:frames.length-1,durationMs:motion.timing.reduce((a,b)=>a+b,0),
        visualReleaseAtMs:motion.release===undefined ? null : motion.timing.slice(0,motion.release).reduce((a,b)=>a+b,0),
        frames:contacts});
    }
  }
  writeSheet(out,'hero-motions',{frames,tags,slices:[{name:'root',keys:[{frame:0,bounds:{x:64,y:120,w:1,h:1},pivot:{x:0,y:0}}]}]});
  writePng(path.join(out,'contact-sheet.png'),filmstrip);
  const manifest={schemaVersion:1,kind:'standalone-baked-avatar-motions',sheet:'hero-motions.sheet.json',
    sourceSize:{w:SIZE,h:SIZE},root:ROOT,rootMotion:'none',facing:'left',weaponsBaked:true,
    integration:'整體角色含武器；播放時替代整個紙娃娃，勿再疊職業武器。時序僅供美術對齊，不定義傷害、碰撞或位移。',clips};
  writeJson(path.join(out,'motions.json'),manifest);
  writePreview(out,manifest);
  console.log(`動作素材輸出：${out}；${tags.length} 組 / ${frames.length} 幀`);
}

function writePreview(out: string, manifest: {clips: object[]}): void {
  const sheet=JSON.parse(fs.readFileSync(path.join(out,'hero-motions.sheet.json'),'utf8'));
  const png=fs.readFileSync(path.join(out,'hero-motions.png')).toString('base64');
  const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>森境旅人 · 技能動作</title>
<style>*{box-sizing:border-box}body{margin:0;background:#101d20;color:#e2e9df;font:16px system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:36px 24px}h1{font-size:30px;margin:6px 0 12px}p{color:#acbbb6;line-height:1.7}header{display:flex;gap:28px;align-items:center;flex-wrap:wrap}.badge{color:#dfbb72;letter-spacing:3px;font-size:12px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px;margin-top:26px}article{background:#1a2a2c;border:1px solid #334441;border-radius:12px;overflow:hidden}h2{font-size:18px;margin:18px 20px 4px}.sub{font-size:12px;color:#a6b5b1;margin:0 20px}canvas{display:block;width:100%;image-rendering:pixelated}footer{padding:12px 18px;background:#152326;display:flex;gap:9px;align-items:center}button,select{background:#344842;color:#f1e5cb;border:1px solid #587065;border-radius:5px;padding:7px;cursor:pointer}input{min-width:0;flex:1}label{font-size:13px}output{font-size:12px;min-width:35px}a{color:#e1c58d}</style>
<main><div class="badge">VERDANT / MOTION LIBRARY</div><h1>森境旅人 · 技能動作</h1><header><p>固定原點 · 透明素材 · 角色與武器同步<br>跳躍高度、前衝、投射物與命中判定交由遊戲程式處理。</p><label>速度 <select id="speed"><option value="0.5">0.5×</option><option selected value="1">1×</option><option value="1.5">1.5×</option></select></label><label><input id="flip" type="checkbox">面向右</label><label><input id="guide" type="checkbox" checked>原點參考線</label></header><section id="clips"></section><p>可暫停並拖曳檢查每一幀。每組首尾使用同職業的共用待機幀。</p></main>
<script>const sheet=${JSON.stringify(sheet)},manifest=${JSON.stringify(manifest)};const image=new Image;image.src='data:image/png;base64,${png}';const states=[];
for(const clip of manifest.clips){const card=document.createElement('article');card.innerHTML='<h2>'+clip.label+'</h2><div class="sub">'+clip.classId+' / '+clip.id+' · '+clip.durationMs+' ms</div><canvas width="384" height="384"></canvas><footer><button>暫停</button><input aria-label="逐幀檢查" type="range" min="0" max="7" value="0"><output>1 / 8</output></footer>';document.querySelector('#clips').append(card);const state={clip,canvas:card.querySelector('canvas'),range:card.querySelector('input'),output:card.querySelector('output'),button:card.querySelector('button'),play:true,i:0,time:0};state.button.onclick=()=>{state.play=!state.play;state.button.textContent=state.play?'暫停':'播放'};state.range.oninput=()=>{state.play=false;state.button.textContent='播放';state.i=+state.range.value;state.time=0};states.push(state)}
let last=0;function tick(now){const dt=Math.min(100,now-last);last=now;for(const s of states){if(s.play){s.time+=dt*+document.querySelector('#speed').value;while(s.time>=s.clip.timing[s.i]){s.time-=s.clip.timing[s.i];s.i=(s.i+1)%8}}s.range.value=s.i;s.output.textContent=(s.i+1)+' / 8';const ctx=s.canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#1a2a2c';ctx.fillRect(0,0,384,384);if(document.querySelector('#guide').checked){ctx.strokeStyle='#455a51';ctx.beginPath();ctx.moveTo(0,360.5);ctx.lineTo(384,360.5);ctx.moveTo(192.5,100);ctx.lineTo(192.5,380);ctx.stroke();ctx.fillStyle='#d6b264';ctx.fillRect(189,357,6,6)}const f=sheet.frames.find(f=>f.filename===String(s.clip.from+s.i));ctx.save();if(document.querySelector('#flip').checked){ctx.translate(384,0);ctx.scale(-1,1)}if(image.complete)ctx.drawImage(image,f.frame.x,f.frame.y,f.frame.w,f.frame.h,f.spriteSourceSize.x*3,f.spriteSourceSize.y*3,f.frame.w*3,f.frame.h*3);ctx.restore()}requestAnimationFrame(tick)}image.onload=()=>requestAnimationFrame(tick);</script></html>`;
  fs.writeFileSync(path.join(out,'preview.html'),html);
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) writeHeroMotions(process.argv[2]);
