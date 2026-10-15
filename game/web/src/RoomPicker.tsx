import { useState } from 'react';
import type { GameCommand, HudState } from '@lawn/engine';
import catalog from '../../assets/landmarks/catalog.json';
import { Icon } from './Icons';
import './room-picker.css';

export function RoomPicker({state,command,onClose}:{state:HudState;command:(cmd:GameCommand)=>void;onClose:()=>void}) {
  const [category,setCategory]=useState('全部');
  const rooms=state.rooms.map((room,index)=>({room,index,scene:catalog.scenes.find(s=>s.roomIds.includes(room.id)&&s.name===room.name)}));
  const filtered=rooms.filter(r=>category==='全部'||(r.scene?.category??'奇幻原境')===category);
  return <div className="panel room-list" aria-label="選擇目的地">
    <div className="room-list-heading"><span className="eyebrow">選擇目的地</span><button aria-label="關閉房間選單" onClick={onClose}><Icon name="close" /></button></div>
    <div className="room-categories" aria-label="地圖風格分類">
      {['全部',...catalog.categories].map(c=><button key={c} aria-pressed={c===category} onClick={()=>setCategory(c)}>{c}</button>)}
    </div>
    <p className="room-category-caption">{category==='全部'?'從森林秘境，到世界風景':category} · {filtered.length} 個目的地</p>
    {filtered.map(({room,index,scene})=><button key={room.id} className={room.id===state.roomId?'current':''} onClick={()=>{onClose();if(room.id!==state.roomId)command({type:'changeRoom',roomId:room.id});}}>
      <span className="room-region" style={scene?{color:scene.accent}:undefined}>{scene?`${scene.category} · ${scene.country}`:'奇幻原境'}</span>
      <span>{String(index+1).padStart(2,'0')} {room.name}</span>
      <span className="sub">押注 {room.betRange[0]}–{room.betRange[1]}{room.id===state.roomId?' · 目前位置':''}</span>
    </button>)}
    {!filtered.length&&<p className="room-category-caption">目前內容尚未包含這個分類的地圖。</p>}
  </div>;
}
