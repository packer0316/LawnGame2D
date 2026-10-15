import type * as Phaser from 'phaser';
import type { ClassId } from '@lawn/shared';

/** 合成低頻撞擊與濾波噪聲；跟隨 Phaser mute／volume，不需要額外下載音源。 */
export class SkillAudio {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private lastHit = -Infinity;
  private unlock = () => {
    if(!this.context && typeof AudioContext!=='undefined') {
      this.context=new AudioContext();
      const c=this.context;
      this.noise=c.createBuffer(1,c.sampleRate*.5,c.sampleRate);
      const data=this.noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    void this.context?.resume().catch(()=>undefined);
  };
  constructor(private scene:Phaser.Scene) {
    window.addEventListener('pointerdown',this.unlock);
    window.addEventListener('keydown',this.unlock);
  }
  play(classId:ClassId,power:number,charge=false):void {
    const c=this.context;
    if(!c||c.state!=='running'||this.scene.sound.mute||this.voices.size>=18)return;
    const now=c.currentTime;
    if(!charge&&now-this.lastHit<.055)return;
    if(!charge)this.lastHit=now;
    const volume=Math.min(1,this.scene.sound.volume)*Math.min(1.5,power);
    const duration=charge?.2:.1+power*.055;
    const oscillator=c.createOscillator(),gain=c.createGain();
    oscillator.type=classId==='assassin'?'triangle':'sine';
    const pitch=classId==='warrior'?125:classId==='mage'?190:classId==='archer'?240:165;
    oscillator.frequency.setValueAtTime(charge?pitch*.6:pitch,now);
    oscillator.frequency.exponentialRampToValueAtTime(charge?pitch*2:Math.max(42,pitch*.28),now+duration);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(volume*(charge?.025:.09),now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    oscillator.connect(gain);gain.connect(c.destination);
    this.voices.add(oscillator);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.voices.delete(oscillator);};
    oscillator.start(now);oscillator.stop(now+duration+.02);
    if(charge||!this.noise)return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),ng=c.createGain();
    source.buffer=this.noise;filter.type='bandpass';
    filter.frequency.setValueAtTime(classId==='mage'?2200:classId==='archer'?3400:1600,now);
    filter.frequency.exponentialRampToValueAtTime(350,now+duration);filter.Q.value=.65;
    ng.gain.setValueAtTime(volume*.08,now);ng.gain.exponentialRampToValueAtTime(.0001,now+duration);
    source.connect(filter);filter.connect(ng);ng.connect(c.destination);
    this.voices.add(source);
    source.onended=()=>{source.disconnect();filter.disconnect();ng.disconnect();this.voices.delete(source);};
    source.start(now);source.stop(now+duration+.02);
  }
  clear():void { for(const v of this.voices){try{v.stop();}catch{/* already ended */}} this.voices.clear(); }
  destroy():void {
    window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);
    this.clear();void this.context?.close().catch(()=>undefined);this.context=null;this.noise=null;
  }
}
