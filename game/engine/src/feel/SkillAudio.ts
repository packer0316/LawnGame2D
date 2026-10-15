import type * as Phaser from 'phaser';
import type { ClassId } from '@lawn/shared';
import { sfx } from '../audio/Sfx';

/**
 * 技能演出用的聲音入口。起手、揮刀、特效、命中的音效改由 GameScene 依 audio/sfxCues 播放真實素材的多層組合，
 * 這裡的 play 保留給 SkillFx 呼叫但不再出聲（避免同一刀響兩次）；月斷的節拍（moon）對應 sfxCues 的 `moon:<段落>`。
 */
export class SkillAudio {
  constructor(_scene: Phaser.Scene) {}
  play(_classId: ClassId, _power: number, _charge = false): void {}
  clear(): void {}
  /** 月斷・月下影殺每一拍：封印、睜眼、斬、衝刺、殘影、收刀、命中、終結 */
  moon(stage: 'seal' | 'eye' | 'cut' | 'dash' | 'shadow' | 'sheath' | 'hit' | 'finish'): void {
    sfx.play(`moon:${stage}`);
  }
  destroy(): void {}
}
