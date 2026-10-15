/**
 * 物理版本：改了任何會影響移動範圍的常數或判定就加 1。
 * 編輯器可以記下產生導航圖時的版本，版本不同就提示重新匯入。
 * 2：落地改沿整條移動線段判定（高速橫移撞上坡不再穿地）。
 */
export const PHYSICS_VERSION = 2;

/**
 * 足場物理常數，單位為內部像素與秒（SPEC §3.5）。
 * 導航圖產生也用這些值，所以改這裡之後要重新產生地圖的導航圖。
 */
export const PHYSICS = {
  /** 固定步長 */
  dt: 1 / 60,
  /** 角色碰撞框：腳底中心為原點 */
  halfWidth: 7,
  height: 46,

  runSpeed: 140,
  groundAccel: 2400,
  groundFriction: 2800,
  airAccel: 1300,
  airMaxSpeed: 140,

  gravity: 1300,
  maxFall: 620,
  jumpSpeed: 520,
  /** 提早放開跳躍鍵時，上升速度乘上這個值（可控跳躍高度） */
  jumpCut: 0.5,

  climbSpeed: 90,
  /** 離繩梯中心多近可以抓 */
  climbGrab: 8,
  /** 從繩梯跳開 */
  climbJumpSpeed: 300,
  climbJumpSideSpeed: 110,

  /** 走到相接的足場時，允許的高低差 */
  stepTolerance: 6,
  /** 下跳後多久內忽略原本的單向平台 */
  dropThroughMs: 220,
  /** 土狼時間：離開平台邊緣後仍可起跳的時間 */
  coyoteMs: 80,
  /** 跳躍緩衝：落地前多久按跳，一落地就起跳 */
  jumpBufferMs: 100,
} as const;

/** 只受物理常數影響的推導值：最高跳躍高度。 */
export const MAX_JUMP_HEIGHT = (PHYSICS.jumpSpeed * PHYSICS.jumpSpeed) / (2 * PHYSICS.gravity);
