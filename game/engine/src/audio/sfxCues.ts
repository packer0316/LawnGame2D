/**
 * 音效組合表（SPEC §4.5）：一個事件 = 好幾層素材依時間差疊起來。素材在 game/assets/sfx/{名稱}.mp3，由 scripts/build-sfx.py 產生。
 *
 * 事件名稱（GameScene 依序找第一個有定義的）：
 * - `cast:<技能>` → `cast:<職業>`：起手（開始施放）
 * - `swing:<技能>`：每一刀出手（近戰揮刀、迴旋刃經過）
 * - `launch:<技能>` → `launch:<職業>`：投射物射出
 * - `fx:<特效>:<職業>` → `fx:<特效>`：這一刀的技能特效（雷擊、地裂、冰爆…），沒打到怪也會響
 * - `cue:<特效>`：技能的演出時點（隕石開始落下、箭射上天）
 * - `hit:<技能>` → `hit:<職業>`：打中怪；力道大再疊 `hit:heavy`，一次打到很多隻再疊 `hit:crowd`
 * - `move:<位移>`：技能位移（衝刺、跳躍、瞬移）
 * - 其他：擊殺、撿錢、跳躍落地、換房、大獎、介面
 */
export interface SfxLayer {
  /** 素材名稱；陣列 = 每次隨機挑一個（同一個聲音聽起來不會一模一樣） */
  s: string | readonly string[];
  /** 延遲（毫秒） */
  at?: number;
  /** 音量 dB；0 = 素材峰值（-1 dBFS） */
  gain?: number;
  /** 播放速度，同時改變音高 */
  rate?: number;
  /** 播放速度隨機 ±（預設 0.04） */
  jitter?: number;
  /** 多段技能：只在第一刀／最後一刀／最後一刀以外放 */
  when?: 'first' | 'last' | 'notLast';
}
export type SfxCue = readonly SfxLayer[];

const SWING = ['swing_1', 'swing_2', 'swing_3', 'swing_4', 'swing_5', 'swing_6', 'swing_7'];
const PUNCH_M = ['punch_m_1', 'punch_m_2', 'punch_m_3', 'punch_m_4', 'punch_m_5'];
const PUNCH_H = ['punch_h_1', 'punch_h_2', 'punch_h_3', 'punch_h_4', 'punch_h_5'];
const SOFT_H = ['soft_h_1', 'soft_h_2', 'soft_h_3'];
const CUT = ['cut_1', 'cut_2', 'cut_3'];
const SLICE = ['slice_1', 'slice_2'];
const DRAW = ['draw_1', 'draw_2'];
const METAL_L = ['metal_l_1', 'metal_l_2', 'metal_l_3'];
const METAL_M = ['metal_m_1', 'metal_m_2', 'metal_m_3'];
const METAL_H = ['metal_h_1', 'metal_h_2'];
const PLATE_H = ['plate_h_1', 'plate_h_2'];
const GLASS_L = ['glass_l_1', 'glass_l_2', 'glass_l_3'];
const GLASS_H = ['glass_h_1', 'glass_h_2'];
const MINING = ['mining_1', 'mining_2', 'mining_3'];
const WOOD = ['wood_1', 'wood_2'];
const ARROW_HIT = ['arrow_hit_1', 'arrow_hit_2'];
const THROW = ['throw_1', 'throw_2'];
const CRUNCH = ['explosion_crunch_1', 'explosion_crunch_2', 'explosion_crunch_3'];
const BELL = ['bell_1', 'bell_2'];
const CHIPS = ['chips_1', 'chips_2', 'chips_3'];
const STEP = ['step_1', 'step_2', 'step_3'];
const SHADE = ['shade_1', 'shade_2'];

/** 大絕招起手的共同底：上升的蓄力 + 結尾的低頻下沉 */
const ULT_RISE: SfxCue = [
  { s: 'riser', gain: -9 },
  { s: 'sub_drop', gain: -10, at: 420 },
];
/** 大絕招最後一刀的收尾重擊 */
const FINALE: SfxLayer = { s: 'cinematic_hit', gain: -4, when: 'last' };

export const SFX_CUES: Record<string, SfxCue> = {
  'moonblade:contact': [{ s: 'cut_2', gain: -8, jitter: .025 }, { s: 'hit_flesh', gain: -14 }, { s: 'sword_ring', gain: -17, rate: 1.2, jitter: .02 }],
  // 工坊刻印：1.05 秒聚能，結果揭曉才觸發成功／失敗音色。
  'forge:charge': [{ s: 'charge_short', gain: -12, rate: 1.25, jitter: 0 }, { s: 'magic_whoosh', gain: -20, rate: 1.4, jitter: 0 }],
  'forge:success': [{ s: 'bell_1', gain: -12, rate: 1.3, jitter: 0 }, { s: 'chime', gain: -12, rate: 1.4, jitter: 0 }, { s: 'sparkle', gain: -19, at: 80, rate: 1.5, jitter: 0 }],
  'forge:failure': [{ s: 'ui_error', gain: -12, jitter: 0 }, { s: 'magic_whoosh', gain: -20, rate: .75, jitter: 0 }],
  'forge:destroyed': [{ s: 'ui_error', gain: -12, jitter: 0 }, { s: 'glass_l_1', gain: -17, at: 70, rate: .8, jitter: 0 }],
  // ---------------------------------------------------------------- 共通：起手、命中
  'cast:warrior': [{ s: DRAW, gain: -10 }],
  'cast:mage': [{ s: 'magic_whoosh', gain: -10 }, { s: 'charge_short', gain: -16 }],
  'cast:archer': [{ s: 'bow_twang', gain: -12, rate: 0.8 }],
  'cast:assassin': [{ s: 'whip', gain: -12, rate: 1.2 }],
  'hit:warrior': [{ s: CUT, gain: -5, at: 12 }, { s: PUNCH_M, gain: -7, at: 12 }],
  'hit:mage': [{ s: PUNCH_M, gain: -8 }, { s: 'spark', gain: -10 }],
  'hit:archer': [{ s: ARROW_HIT, gain: -5 }, { s: PUNCH_M, gain: -12 }],
  'hit:assassin': [{ s: SLICE, gain: -6 }, { s: METAL_L, gain: -14 }, { s: 'hit_flesh', gain: -13, at: 10 }],
  /** 力道大（大招、重擊）：再疊一層悶重的打擊 */
  'hit:heavy': [{ s: PUNCH_H, gain: -5, at: 8 }, { s: 'hit_hard', gain: -9, at: 8 }],
  /** 一刀打中很多隻：再疊一層厚重的群體打擊感 */
  'hit:crowd': [{ s: SOFT_H, gain: -6, at: 20 }, { s: CRUNCH, gain: -16, at: 30 }],

  // ---------------------------------------------------------------- 劍士
  // 三連斬：一、二刀輕快，第三刀重
  'swing:skill_0001': [{ s: SWING, gain: -4, rate: 1.08 }],
  'swing:skill_0002': [{ s: SWING, gain: -4, rate: 0.98 }],
  'swing:skill_0003': [{ s: 'swing_big', gain: -3 }, { s: SWING, gain: -9, at: 25, rate: 0.9 }],
  'hit:skill_0003': [{ s: CUT, gain: -4, at: 12 }, { s: PUNCH_H, gain: -5, at: 12 }, { s: METAL_L, gain: -16, at: 12 }],
  // 旋風斬：跳起來轉，每一圈一聲破風
  'cast:skill_0004': [{ s: 'jump', gain: -8 }, { s: 'swish_long', gain: -5, at: 70 }, { s: 'draw_2', gain: -12 }],
  'fx:whirl': [{ s: SWING, gain: -4, rate: 1.12 }, { s: 'whoosh', gain: -11, rate: 1.25 }],
  // 拔刀斬：收刀蓄勢 → 衝刺 → 刀鳴
  'cast:skill_0005': [{ s: 'draw_long', gain: -4 }, { s: 'metal_tick', gain: -10, at: 330 }],
  'fx:iaido': [{ s: 'sword_ring', gain: -5 }, { s: 'cut_2', gain: -5, at: 10 }, { s: 'whip', gain: -9 }],
  // 地裂重劈：重劈 → 地面碎裂 → 低頻餘震
  'cast:skill_0006': [{ s: 'charge_short', gain: -16, rate: 0.7 }, { s: 'swing_heavy', gain: -4, at: 560, rate: 0.8 }, { s: 'rumble', gain: -10, at: 700 }],
  'fx:quake': [{ s: 'smash', gain: -2 }, { s: 'explosion_low', gain: -6 }, { s: MINING, gain: -9, at: 40 }, { s: 'rock', gain: -9, at: 120 }],
  // 突刺衝鋒
  'cast:skill_0007': [{ s: 'draw_1', gain: -9 }, { s: 'charge_short', gain: -13, rate: 1.2 }],
  'fx:streak': [{ s: 'whoosh', gain: -3, rate: 0.85 }, { s: 'blade_wave', gain: -4 }, { s: 'sword_ring', gain: -10, at: 60 }],
  // 昇龍斬：龍吟 → 斜向大跳上升斬
  'cast:skill_0008': [{ s: 'dragon_roar', gain: -7, at: 160 }, { s: 'jump', gain: -6, at: 280 }],
  'fx:rising': [{ s: 'swing_big', gain: -4, rate: 1.1 }, { s: 'fire_whoosh', gain: -12, rate: 1.2 }],
  // 劍氣斬：虎嘯 → 一道道劍氣
  'cast:skill_0009': [{ s: 'tiger_roar', gain: -4, at: 250 }, { s: 'draw_long', gain: -9 }],
  'fx:wave': [{ s: 'blade_wave', gain: -3 }, { s: 'whoosh', gain: -7, rate: 0.8 }, { s: 'swing_big', gain: -10, rate: 0.9 }],
  // 聖劍斬：聖歌 → 五道聖光斬 → 鐘聲收尾
  'cast:skill_0040': [...ULT_RISE, { s: 'choir', gain: -5, at: 150 }, { s: 'draw_long', gain: -7 }],
  'cue:holyWave': [{ s: 'sparkle', gain: -10 }, { s: 'whoosh_soft', gain: -11, rate: 0.8 }],
  'fx:holyHit': [{ s: BELL, gain: -9 }, { s: 'sword_ring', gain: -9 }, { s: 'cut_2', gain: -7, at: 10 }, { s: 'chime', gain: -6, when: 'last' }, FINALE],
  // 天劍降臨：天空閃光 → 巨劍落下
  'cast:skill_0041': [...ULT_RISE, { s: 'choir_2', gain: -6, at: 180 }, { s: 'angel', gain: -9, at: 300 }],
  'cue:skyFlash': [{ s: 'thunder_bang', gain: -7 }, { s: 'chime', gain: -11 }],
  'fx:swordRain': [{ s: 'whoosh', gain: -8, rate: 1.3 }, { s: METAL_M, gain: -4, at: 30 }, { s: 'sword_clang', gain: -7, at: 30 }, { s: PLATE_H, gain: -10, at: 35 }, { s: 'smash', gain: -10, at: 40 }, { s: METAL_H, gain: -6, at: 30, when: 'last' }, FINALE],

  // ---------------------------------------------------------------- 法師
  // 魔法彈
  'cast:skill_0011': [{ s: 'magic_whoosh', gain: -12, rate: 1.2 }],
  'launch:skill_0011': [{ s: 'magic_bolt', gain: -7, rate: 1.15 }, { s: 'spark', gain: -12 }],
  'hit:skill_0011': [{ s: 'magic_sparkle', gain: -12, rate: 1.4 }, { s: PUNCH_M, gain: -9 }],
  // 雷電術：每一道落雷是爆裂聲 + 電流，最後一道帶雷鳴
  'cast:skill_0012': [{ s: 'charge_short', gain: -9 }, { s: 'zap_buzz', gain: -15, at: 200 }],
  'fx:lightning': [{ s: 'thunder_bang', gain: -8 }, { s: 'zap_short', gain: -6 }, { s: 'spark', gain: -9 }, { s: 'thunder', gain: -6, when: 'last' }],
  // 隕石術：蓄力 → 火球呼嘯落下 → 爆炸、餘震
  'cast:skill_0013': [{ s: 'charge_long', gain: -11 }, { s: 'magic_cast', gain: -7 }],
  'cue:meteor': [{ s: 'fire_whoosh', gain: -2, rate: 0.85 }, { s: 'riser_2', gain: -14, rate: 1.4 }],
  'fx:impact': [{ s: 'explosion', gain: -2 }, { s: 'explosion_low', gain: -4 }, { s: 'cannon', gain: -10 }, { s: 'fire_hit', gain: -7 }, { s: 'rumble', gain: -12, at: 100 }],
  // 瞬移術
  'cast:skill_0014': [{ s: 'magic_cast', gain: -11, rate: 1.2 }],
  'fx:arcane': [{ s: 'magic_sparkle', gain: -7 }, { s: 'zap_short', gain: -12 }],
  // 冰霜新星：冰晶炸開，最後一圈碎裂
  'cast:skill_0015': [{ s: 'charge_short', gain: -11, rate: 0.9 }],
  'fx:nova': [{ s: 'ice_shatter', gain: -4 }, { s: GLASS_L, gain: -9 }, { s: 'ice_hit', gain: -7 }, { s: 'whoosh', gain: -11, rate: 0.7 }, { s: 'ice_break', gain: -3, when: 'last' }, { s: GLASS_H, gain: -8, when: 'last', at: 40 }],
  // 連鎖閃電：電流一節節跳，最後一下雷爆
  'cast:skill_0016': [{ s: 'zap_buzz', gain: -9 }],
  'fx:chainBolt': [{ s: 'zap_short', gain: -6, jitter: 0.15 }, { s: 'spark', gain: -7 }, { s: 'thunder_bang', gain: -7, when: 'last' }],
  // 隕石天降：天空閃光 → 一陣陣隕石爆炸
  'cast:skill_0042': [...ULT_RISE, { s: 'charge_long', gain: -11 }, { s: 'fire_roar', gain: -9, at: 300 }],
  'fx:meteorShower': [{ s: 'explosion', gain: -4 }, { s: CRUNCH, gain: -7 }, { s: 'fire_hit', gain: -9 }, FINALE],
  // 死神召喚：黑暗低鳴 → 法陣 → 死神現身 → 鐮刀橫掃與黑暗爆裂
  'cast:skill_0043': [{ s: 'sub_drop', gain: -6 }, { s: 'dark_drone', gain: -9 }],
  'cue:summonCircle': [{ s: 'dark_portal', gain: -4 }, { s: 'charge_long', gain: -15, rate: 0.6 }],
  'cue:reaper': [{ s: 'shade_3', gain: -4 }, { s: 'dark_drone', gain: -7, rate: 0.8 }],
  'fx:reaperSweep': [{ s: 'swing_heavy', gain: -2, rate: 0.7 }, { s: 'whoosh', gain: -6, rate: 0.6 }, { s: SHADE, gain: -12 }],
  'fx:darkBurst': [{ s: 'explosion_low', gain: -4 }, { s: 'dark_drone', gain: -11, rate: 1.3 }, FINALE],

  // ---------------------------------------------------------------- 弓箭手
  'launch:archer': [{ s: ['bow_release', 'bow_snap'], gain: -4 }, { s: 'arrow_loose', gain: -11, at: 10 }],
  // 穿透箭
  'cast:skill_0022': [{ s: 'bow_twang', gain: -9, rate: 0.85 }],
  'fx:streak:archer': [{ s: 'bow_release', gain: -4 }, { s: 'arrow_fly', gain: -6, at: 20 }, { s: 'whoosh', gain: -11 }],
  // 箭雨：射上天 → 箭一波波落地
  'cue:arrowUp': [{ s: 'bow_release', gain: -4 }, { s: 'arrow_loose', gain: -7, at: 40 }, { s: 'arrow_loose', gain: -9, at: 90, rate: 1.1 }, { s: 'whoosh', gain: -9, rate: 1.3 }],
  'fx:arrowRain': [{ s: ARROW_HIT, gain: -6 }, { s: ARROW_HIT, gain: -8, at: 50 }, { s: WOOD, gain: -11, at: 90 }, { s: ARROW_HIT, gain: -10, at: 130 }],
  // 後空翻射擊
  'cast:skill_0025': [{ s: 'jump', gain: -5 }, { s: 'swish_long', gain: -9 }],
  'fx:arrowFan': [{ s: 'bow_release', gain: -5 }, { s: 'arrow_loose', gain: -8, at: 30 }, { s: 'arrow_loose', gain: -10, at: 60, rate: 1.1 }],
  // 爆裂箭
  'launch:skill_0026': [{ s: 'bow_release', gain: -3 }, { s: 'fire_whoosh', gain: -13, rate: 1.3 }],
  'hit:skill_0026': [{ s: 'explosion', gain: -4 }, { s: 'fire_burst', gain: -6 }, { s: CRUNCH, gain: -11 }],
  // 萬箭齊發：拉滿弓 → 齊射 → 全畫面箭雨
  'cast:skill_0044': [...ULT_RISE, { s: 'jump', gain: -7 }],
  'cue:arrowVolley': [{ s: 'bow_release', gain: -2 }, { s: 'bow_twang', gain: -4, at: 40 }, { s: 'arrow_fly', gain: -4, at: 60 }, { s: 'arrow_fly', gain: -7, at: 140, rate: 1.15 }, { s: 'whoosh', gain: -7, at: 100, rate: 0.8 }],
  'fx:screenArrowRain': [{ s: ARROW_HIT, gain: -4 }, { s: ARROW_HIT, gain: -6, at: 40 }, { s: WOOD, gain: -9, at: 70 }, { s: ARROW_HIT, gain: -8, at: 110 }, { s: 'arrow_hit_2', gain: -10, at: 160 }, FINALE],
  // 流星神箭：蓄力 → 彗星箭 → 爆裂
  'cast:skill_0045': [...ULT_RISE, { s: 'charge_long', gain: -7 }, { s: 'bow_twang', gain: -7, at: 400, rate: 0.8 }],
  'cue:comet': [{ s: 'bow_release', gain: -2 }, { s: 'fire_whoosh', gain: -4 }, { s: 'magic_bolt', gain: -9 }],
  'fx:cometBurst': [{ s: 'explosion', gain: -4 }, { s: 'magic_impact', gain: -6 }, { s: 'sparkle', gain: -11 }, FINALE],

  // ---------------------------------------------------------------- 盜賊
  'launch:assassin': [{ s: THROW, gain: -6 }, { s: 'metal_tick', gain: -15, rate: 1.3 }],
  'hit:skill_0031': [{ s: 'cut_1', gain: -7 }, { s: METAL_L, gain: -12 }],
  // 飛刃風暴
  'cast:skill_0032': [{ s: 'metal_ring', gain: -9 }, { s: 'whip', gain: -11 }],
  'fx:bladeFan': [{ s: THROW, gain: -4 }, { s: THROW, gain: -7, at: 40, rate: 1.1 }, { s: 'whoosh', gain: -9, rate: 1.3 }, { s: 'metal_ring', gain: -13, at: 60 }],
  // 影襲：每一刀瞬移到怪背後
  'cast:skill_0033': [{ s: 'puff', gain: -9 }],
  'fx:shadowSlash': [{ s: 'teleport', gain: -13, rate: 1.3 }, { s: 'whip', gain: -4 }, { s: CUT, gain: -7, at: 20 }],
  // 疾風連斬
  'cast:skill_0034': [{ s: 'draw_2', gain: -9, rate: 1.2 }],
  'fx:pathSlash': [{ s: 'whip', gain: -4 }, { s: 'swing_big', gain: -7, rate: 1.2 }, { s: SLICE, gain: -9, at: 20 }],
  // 迴旋刃：擲出 → 每次掠過怪
  'cue:boomerang': [{ s: 'throw_1', gain: -4 }, { s: 'swish_long', gain: -7, at: 60 }],
  'swing:skill_0035': [{ s: 'whoosh', gain: -9, rate: 1.4 }, { s: 'metal_tick', gain: -15 }],
  // 分身飛鏢：分身 → 迴旋的飛鏢風暴
  'cast:skill_0046': [...ULT_RISE, { s: 'puff', gain: -6 }],
  'fx:shurikenSpin': [{ s: 'metal_ring', gain: -7 }, { s: 'whoosh', gain: -9, rate: 1.5 }],
  'fx:shurikenStorm': [{ s: THROW, gain: -4 }, { s: THROW, gain: -6, at: 30, rate: 1.15 }, { s: THROW, gain: -8, at: 60, rate: 0.9 }, FINALE],
  // 忍術・影分身
  'cast:skill_0047': [{ s: 'poof', gain: -4 }, { s: 'puff', gain: -6, at: 80 }, { s: 'dark_drone', gain: -13 }, { s: 'riser', gain: -11 }],
  'fx:shadowClones': [{ s: 'poof', gain: -7 }, { s: 'whip', gain: -9 }],
  'fx:cloneSlash': [{ s: 'whip', gain: -4 }, { s: CUT, gain: -6, at: 20 }, { s: 'swing_big', gain: -11 }, FINALE],
  // 月斷・月下影殺：演出自己的節拍（MoonExecution 呼叫 moon:<段落>），命中聲也由演出負責
  'hit:skill_0048': [],
  'cast:skill_0049': [{s:'sub_drop',gain:-6},{s:'dark_drone',gain:-8},{s:'charge_long',gain:-10}],
  'hit:skill_0049': [],
  'grasp:rise': [{s:CRUNCH,gain:-12,rate:.65},{s:'dark_portal',gain:-8}],
  'grasp:crush': [{s:CRUNCH,gain:-4},{s:'explosion_low',gain:-8},{s:'magic_impact',gain:-9}],
  'grasp:finish': [{s:'cinematic_hit',gain:-3},{s:'explosion_low',gain:-5},{s:GLASS_H,gain:-10}],
  'moon:seal': [{ s: 'sub_drop', gain: -6 }, { s: BELL, gain: -9, rate: 0.7 }],
  'moon:eye': [{ s: 'sparkle', gain: -6, rate: 0.8 }, { s: 'zap_short', gain: -15 }],
  'moon:cut': [{ s: 'sword_ring', gain: -2 }, { s: 'cut_2', gain: -4 }],
  'moon:dash': [{ s: 'whoosh', gain: -4 }, { s: 'teleport', gain: -13 }],
  'moon:shadow': [{ s: SHADE, gain: -9 }, { s: 'whip', gain: -6 }],
  'moon:sheath': [{ s: 'draw_1', gain: -4, rate: 0.85 }, { s: 'metal_tick', gain: -6 }],
  'moon:hit': [{ s: CUT, gain: -6 }, { s: PUNCH_M, gain: -8 }],
  'moon:finish': [{ s: 'cinematic_hit', gain: -2 }, { s: 'sword_ring', gain: -6 }, { s: 'explosion_low', gain: -8 }],

  // ---------------------------------------------------------------- 位移
  'move:dash': [{ s: 'whoosh', gain: -6 }],
  'move:leap': [{ s: 'jump', gain: -8 }, { s: 'whoosh_soft', gain: -11 }],
  'move:tierLeap': [{ s: 'jump', gain: -6 }, { s: 'swing_big', gain: -9 }],
  'move:blink': [{ s: 'teleport', gain: -6 }, { s: 'warp', gain: -13 }],
  'move:tierBlink': [{ s: 'teleport', gain: -5 }, { s: 'warp', gain: -11 }],

  // ---------------------------------------------------------------- 角色
  jump: [{ s: 'jump', gain: -14, rate: 1.2 }],
  airJump: [{ s: 'jump', gain: -12, rate: 1.35 }, { s: 'whoosh_soft', gain: -16 }],
  land: [{ s: STEP, gain: -14 }],
  landHeavy: [{ s: 'land_heavy', gain: -9 }, { s: STEP, gain: -12 }],
  roll: [{ s: 'swish_long', gain: -11 }, { s: 'jump', gain: -15, rate: 0.9 }],
  portal: [{ s: 'warp', gain: -5 }],

  // ---------------------------------------------------------------- 擊殺、掉落、獎勵
  kill: [{ s: 'monster_die', gain: -13 }, { s: 'squish', gain: -17 }, { s: 'poof', gain: -15, rate: 1.3 }],
  /** 倍率 ≥ 10 的怪 */
  killRich: [{ s: 'coins_burst', gain: -7 }, { s: 'sparkle', gain: -9, at: 60 }],
  coinsSpill: [{ s: [...CHIPS, 'coins_handle'], gain: -12 }, { s: 'coin_2', gain: -12, at: 50 }],
  /** 撿到金幣：固定音高的一聲輕響（使用者不要越撿越高的音階） */
  coin: [{ s: 'coin_2', gain: -12, jitter: 0 }],
  'win:big': [{ s: 'win_big', gain: -2 }, { s: 'coins_burst', gain: -4, at: 200 }],
  'win:mega': [{ s: 'win_mega', gain: -1 }, { s: 'coins_burst', gain: -3, at: 150 }, { s: 'chips_stack', gain: -6, at: 450 }],
  'win:super': [{ s: 'win_super', gain: -1 }, { s: 'win_coin', gain: -5, at: 300 }, { s: 'coins_burst', gain: -3, at: 100 }],

  // ---------------------------------------------------------------- 介面
  'ui:click': [{ s: 'ui_click', gain: -8 }],
  'ui:hover': [{ s: 'ui_hover', gain: -18 }],
  'ui:open': [{ s: 'ui_open', gain: -10 }],
  'ui:close': [{ s: 'ui_close', gain: -10 }],
  'ui:toggle': [{ s: 'ui_toggle', gain: -8 }],
  'ui:confirm': [{ s: 'ui_confirm', gain: -8 }],
  'ui:error': [{ s: 'ui_error', gain: -8 }],
  'ui:select': [{ s: 'ui_select', gain: -8 }],
  'ui:betUp': [{ s: 'chip_lay', gain: -6 }, { s: CHIPS, gain: -12, at: 35 }],
  'ui:betDown': [{ s: 'chip_lay', gain: -9, rate: 0.9 }],
  'ui:class': [{ s: DRAW, gain: -11 }, { s: 'ui_select', gain: -9 }],
  'ui:autoOn': [{ s: 'ui_confirm', gain: -7 }, { s: 'power_up', gain: -16 }],
  'ui:autoOff': [{ s: 'ui_switch', gain: -8 }],
};

/** 所有用到的素材名稱（測試檢查檔案都在） */
export function cueSamples(): Set<string> {
  const names = new Set<string>();
  for (const cue of Object.values(SFX_CUES)) for (const layer of cue) for (const s of typeof layer.s === 'string' ? [layer.s] : layer.s) names.add(s);
  return names;
}
