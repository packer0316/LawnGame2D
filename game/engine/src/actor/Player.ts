import {
  PHYSICS,
  createBody,
  stepBody,
  type BodyOptions,
  type BodyState,
  type ClassDef,
  type FootholdWorld,
  type SkillCue,
  type SkillDef,
  type SkillMove,
  type StepEvents,
} from '@lawn/shared';
import type { AvatarView } from '../avatar/AvatarView';

/** 戰鬥手感參數（SPEC §3.4）。 */
export const FEEL = {
  /** 輸入緩衝 */
  bufferMs: 150,
  /** 攻擊動作結束後，多久內按攻擊仍可接下一段連擊 */
  comboGraceMs: 650,
  roll: { durationMs: 350, distance: 100, cooldownMs: 600, cancelAfterMs: 100 },
  /** 落地壓扁姿勢顯示多久 */
  landMs: 90,
} as const;

export interface PlayerInput {
  x: -1 | 0 | 1;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attack: boolean;
  /** 常駐小技能（X） */
  secondary: boolean;
  /** 這一步按下的技能列格子（0 起算）；-1 = 沒按 */
  skill: number;
  roll: boolean;
}

type BufferedAction = 'attack' | 'secondary' | 'skill' | 'roll' | 'jump';

interface AttackState {
  kind: 'attack';
  skill: SkillDef;
  elapsed: number;
  nextStrike: number;
  nextCue: number;
  duration: number;
  /** 位移已經發動 */
  moved: boolean;
  /** 衝刺已結束（停下來，不要靠摩擦力滑很遠） */
  dashDone: boolean;
  /** 技能開始時的位置（path 範圍的起點） */
  origin: { x: number; y: number };
  /** tierLeap：場景算好的空中水平速度（往目標足場的拋物線） */
  leapVx?: number;
}

type State = { kind: 'free' } | AttackState | { kind: 'roll'; elapsed: number; dir: 1 | -1 };

/** 動作長度（毫秒，1 倍速）。 */
export interface PoseTiming {
  pose(tag: string): number;
  motion(tag: string): number;
}

export interface PlayerHooks {
  /** 第 index 刀判定的時間到了 */
  onStrike(skill: SkillDef, index: number): void;
  /** 技能演出時點（不判定） */
  onCue?(skill: SkillDef, cue: SkillCue): void;
  /** 技能位移發動（blink 由場景瞬移；dash、leap 的物理由 Player 處理，場景只加演出） */
  onMove?(skill: SkillDef, move: SkillMove): void;
  /** 技能開始前呼叫；回傳 false 表示不能放（例如影襲找不到目標） */
  onSkillStart?(skill: SkillDef): boolean;
  onRoll?(): void;
  /**
   * 技能列第 slot 格現在能放的技能（null = 空格或還沒解鎖，SPEC §3.3）。
   * 沒有提供時照 classDef.skills。
   */
  resolveSlot?(slot: number): string | null;
  onJump?(air: boolean): void;
  onLand?(impact: number): void;
}

export class Player {
  readonly body: BodyState;
  private state: State = { kind: 'free' };
  private nowMs = 0;
  private buffer: { action: BufferedAction; slot: number; at: number } | null = null;
  private readonly cooldowns = new Map<string, number>();
  private rollCooldownMs = 0;
  private combo: { next: string; until: number } | null = null;
  private landMs = 0;
  private lastFallSpeed = 0;
  private prone = false;
  /** 最後一次站在地上的位置：掉出地圖時回到這裡 */
  private safeGround: { x: number; y: number; fh: number } | null = null;
  lastEvents: StepEvents | null = null;

  constructor(
    world: FootholdWorld,
    x: number,
    y: number,
    public classDef: ClassDef,
    private readonly skills: Map<string, SkillDef>,
    private readonly timing: PoseTiming,
    readonly avatar: AvatarView,
    private readonly hooks: PlayerHooks,
  ) {
    this.body = createBody(world, x, y, 1);
  }

  get attacking(): SkillDef | null {
    return this.state.kind === 'attack' ? this.state.skill : null;
  }

  /** 目前技能開始時的位置（path 範圍用）。 */
  get skillOrigin(): { x: number; y: number } | null {
    return this.state.kind === 'attack' ? this.state.origin : null;
  }

  get rolling(): boolean {
    return this.state.kind === 'roll';
  }

  cooldown(skillId: string): number {
    return this.cooldowns.get(skillId) ?? 0;
  }

  setClass(classDef: ClassDef): void {
    this.classDef = classDef;
    this.state = { kind: 'free' };
    this.combo = null;
  }

  /** 放下一個技能（掛機或觸控直接呼叫）。 */
  canUse(skillId: string): boolean {
    return (this.cooldowns.get(skillId) ?? 0) <= 0;
  }

  /** 固定步長前進一步。 */
  step(world: FootholdWorld, input: PlayerInput): void {
    const dt = PHYSICS.dt * 1000;
    this.nowMs += dt;
    for (const [id, ms] of this.cooldowns) this.cooldowns.set(id, Math.max(0, ms - dt));
    this.rollCooldownMs = Math.max(0, this.rollCooldownMs - dt);
    this.landMs = Math.max(0, this.landMs - dt);

    const presses: [BufferedAction, boolean][] = [
      ['attack', input.attack],
      ['secondary', input.secondary],
      ['skill', input.skill >= 0],
      ['roll', input.roll],
      ['jump', input.jumpPressed],
    ];
    for (const [action, pressed] of presses) if (pressed) this.buffer = { action, slot: input.skill, at: this.nowMs };
    if (this.buffer && this.nowMs - this.buffer.at > FEEL.bufferMs) this.buffer = null;

    let options: BodyOptions = { maxAirJumps: this.classDef.maxAirJumps };
    let jumpPressed = input.jumpPressed;

    if (this.state.kind === 'free') {
      if (this.tryStartBuffered()) return this.step2(world, input, this.optionsForState(), false);
    } else if (this.state.kind === 'attack') {
      const s = this.state;
      s.elapsed += dt;
      const move = s.skill.move;
      if (move && !s.moved && s.elapsed >= move.atMs) {
        s.moved = true;
        if (move.kind === 'leap') {
          this.body.vy = -move.vy;
          this.body.ground = null;
          this.body.climb = null;
        }
        this.hooks.onMove?.(s.skill, move);
      }
      if (move?.kind === 'dash' && s.moved && !s.dashDone && s.elapsed >= move.atMs + move.durationMs) {
        s.dashDone = true;
        this.body.vx = 0;
      }
      const cues = s.skill.cues ?? [];
      while (s.nextCue < cues.length && cues[s.nextCue]!.atMs <= s.elapsed) {
        this.hooks.onCue?.(s.skill, cues[s.nextCue]!);
        s.nextCue += 1;
      }
      while (s.nextStrike < s.skill.strikes.length && s.skill.strikes[s.nextStrike]!.atMs <= s.elapsed) {
        this.hooks.onStrike(s.skill, s.nextStrike);
        s.nextStrike += 1;
      }
      const cancelable = s.elapsed >= s.skill.cancelFromMs && s.nextStrike >= s.skill.strikes.length;
      if (cancelable && this.buffer) {
        if (this.buffer.action === 'jump') {
          this.buffer = null;
          this.endAttack();
          jumpPressed = true;
        } else if (this.tryStartBuffered()) {
          return this.step2(world, input, this.optionsForState(), false);
        }
      } else if (s.elapsed >= s.duration && !this.inSkillLeap(s)) {
        this.endAttack();
      }
      if (this.state.kind === 'attack') jumpPressed = false;
    } else if (this.state.kind === 'roll') {
      const s = this.state;
      s.elapsed += dt;
      // 翻滾可以被攻擊取消（Dead Cells）
      if (s.elapsed >= FEEL.roll.cancelAfterMs && this.buffer && this.buffer.action !== 'roll' && this.buffer.action !== 'jump' && this.tryStartBuffered()) {
        return this.step2(world, input, this.optionsForState(), false);
      }
      if (s.elapsed >= FEEL.roll.durationMs) this.state = { kind: 'free' };
      jumpPressed = false;
    }
    options = this.optionsForState();
    this.step2(world, input, options, jumpPressed);
  }

  private step2(world: FootholdWorld, input: PlayerInput, options: BodyOptions, jumpPressed: boolean): void {
    const free = this.state.kind === 'free';
    const wasGround = this.body.ground !== null;
    // 趴下：在地上按 ↓（沒有要下跳、附近沒有往下的繩梯時）不能移動
    this.prone = free && wasGround && input.down && !jumpPressed && !world.climbableAt(this.body.x, this.body.y, PHYSICS.climbGrab, 24);
    const events = stepBody(
      world,
      this.body,
      {
        x: free && !this.prone ? input.x : 0,
        up: free && input.up,
        down: free && input.down,
        jumpPressed: free && jumpPressed,
        // 技能跳躍（旋風斬、昇龍斬）不受「放開跳躍鍵就降低高度」影響
        jumpHeld: input.jumpHeld || (this.state.kind === 'attack' && this.state.moved && (this.state.skill.move?.kind === 'leap' || this.state.skill.move?.kind === 'tierLeap')),
      },
      options,
    );
    this.lastEvents = events;
    if (this.body.vy > 0) this.lastFallSpeed = this.body.vy;
    if (events.jumped || events.airJumped) this.hooks.onJump?.(events.airJumped);
    if (events.landed && !wasGround) {
      if (this.lastFallSpeed > 260) this.landMs = FEEL.landMs;
      this.hooks.onLand?.(this.lastFallSpeed);
      this.lastFallSpeed = 0;
    }
    if (this.body.ground !== null) {
      this.safeGround = { x: this.body.x, y: this.body.y, fh: this.body.ground };
    } else if (events.fellOut) {
      // 掉出地圖（保險）：回到最後站過的地面；連一次都沒站過才從地圖頂端落下
      const safe = this.safeGround;
      Object.assign(this.body, safe ? { x: safe.x, y: safe.y, ground: safe.fh } : { y: 0 }, { vx: 0, vy: 0, climb: null });
    }
  }

  private optionsForState(): BodyOptions {
    const base: BodyOptions = { maxAirJumps: this.classDef.maxAirJumps };
    if (this.state.kind === 'roll') {
      const speed = (FEEL.roll.distance / FEEL.roll.durationMs) * 1000;
      return { ...base, forcedVx: this.state.dir * speed, canClimb: false };
    }
    if (this.state.kind === 'attack') {
      const s = this.state;
      const move = s.skill.move;
      if (move?.kind === 'dash' && s.moved && s.elapsed < move.atMs + move.durationMs) {
        return { ...base, forcedVx: (this.body.facing * move.distance) / (move.durationMs / 1000), canClimb: false };
      }
      if (move?.kind === 'leap' && s.moved && this.body.ground === null) return { ...base, forcedVx: this.body.facing * move.vx, canClimb: false };
      if (move?.kind === 'tierLeap' && s.moved && this.body.ground === null) return { ...base, forcedVx: s.leapVx ?? 0, canClimb: false };
      const strike = s.skill.strikes[Math.min(s.nextStrike, s.skill.strikes.length - 1)]!;
      const lunging = s.skill.lunge && Math.abs(s.elapsed - strike.atMs) < 70 && s.nextStrike <= s.skill.strikes.length;
      if (this.body.ground === null) return { ...base, forcedVx: this.body.vx * 0.9, canClimb: false };
      if (lunging) return { ...base, forcedVx: this.body.facing * s.skill.lunge!, canClimb: false };
      return { ...base, rooted: true, canClimb: false };
    }
    return base;
  }

  /**
   * tierLeap 的拋物線（場景依目標足場算好）：往上 vy、空中水平速度 vx；
   * dropFh = 往下跳時要穿過的腳下平台。
   */
  launch(vx: number, vy: number, dropFh: number | null): void {
    if (this.state.kind !== 'attack') return;
    this.state.leapVx = vx;
    this.body.vy = -vy;
    this.body.ground = null;
    this.body.climb = null;
    if (Math.abs(vx) > 1) this.body.facing = vx > 0 ? 1 : -1;
    if (dropFh !== null) {
      this.body.dropFh = dropFh;
      this.body.dropMs = 600;
    }
  }

  /** 技能大跳還在空中：落地前不結束技能，拋物線才不會被切斷（最多多撐 1.5 秒）。 */
  private inSkillLeap(s: AttackState): boolean {
    return s.skill.move?.kind === 'tierLeap' && s.moved && this.body.ground === null && s.elapsed < s.duration + 1500;
  }

  private tryStartBuffered(): boolean {
    const buffered = this.buffer;
    if (!buffered) return false;
    if (buffered.action === 'jump') return false;
    if (this.body.climb !== null && buffered.action !== 'roll') return false;

    if (buffered.action === 'roll') {
      if (this.rollCooldownMs > 0 || this.body.ground === null || this.body.climb !== null) return false;
      this.buffer = null;
      this.endAttack();
      this.state = { kind: 'roll', elapsed: 0, dir: this.body.facing };
      this.rollCooldownMs = FEEL.roll.cooldownMs;
      this.avatar.play('roll', { restart: true, loop: false });
      this.hooks.onRoll?.();
      return true;
    }

    let skillId: string;
    if (buffered.action === 'secondary') {
      if (!this.classDef.secondary) {
        this.buffer = null;
        return false;
      }
      skillId = this.classDef.secondary;
    } else if (buffered.action === 'attack') {
      const chaining =
        (this.state.kind === 'attack' && this.state.skill.comboNext) || (this.combo && this.combo.until >= this.nowMs ? this.combo.next : null);
      skillId = chaining || this.classDef.basic;
    } else {
      const slotSkill = this.hooks.resolveSlot ? this.hooks.resolveSlot(buffered.slot) : (this.classDef.skills[buffered.slot] ?? null);
      if (!slotSkill) {
        this.buffer = null;
        return false;
      }
      skillId = slotSkill;
    }
    const skill = this.skills.get(skillId);
    if (!skill || (this.cooldowns.get(skillId) ?? 0) > 0) return false;
    if (this.hooks.onSkillStart && !this.hooks.onSkillStart(skill)) {
      this.buffer = null;
      return false;
    }
    this.buffer = null;
    const lastStrike = skill.strikes.at(-1)!.atMs;
    // 有整體動畫就播整體動畫（取代紙娃娃），沒有就播紙娃娃的 pose
    const motion = skill.motion;
    const usingMotion = motion !== undefined && this.avatar.playMotion(motion.tag, { speed: motion.speed ?? 1, loop: motion.loop ?? false });
    const actionMs = usingMotion ? (motion.loop ? 0 : this.timing.motion(motion.tag) / (motion.speed ?? 1)) : this.timing.pose(skill.pose);
    const moveEnd = skill.move?.kind === 'dash' ? skill.move.atMs + skill.move.durationMs : 0;
    const duration = Math.max(actionMs, lastStrike + 80, skill.cancelFromMs, moveEnd);
    this.state = { kind: 'attack', skill, elapsed: 0, nextStrike: 0, nextCue: 0, duration, moved: false, dashDone: false, origin: { x: this.body.x, y: this.body.y } };
    if (skill.cooldownSec > 0) this.cooldowns.set(skill.id, skill.cooldownSec * 1000);
    this.combo = null;
    if (!usingMotion) {
      this.avatar.stopMotion();
      this.avatar.play(skill.pose, { restart: true, loop: duration > this.timing.pose(skill.pose) + 1 });
    }
    return true;
  }

  private endAttack(): void {
    if (this.state.kind !== 'attack') return;
    const next = this.state.skill.comboNext;
    this.combo = next ? { next, until: this.nowMs + FEEL.comboGraceMs } : null;
    this.state = { kind: 'free' };
  }

  /** 依狀態選動畫（每個畫面更新呼叫）。 */
  animate(): void {
    const avatar = this.avatar;
    avatar.setFacing(this.body.facing);
    if (this.state.kind !== 'attack') avatar.stopMotion();
    if (this.state.kind !== 'free') return;
    const b = this.body;
    if (b.climb !== null) {
      // 繩或梯：沒在動就停在目前幀
      avatar.play(this.climbTag(), { loop: true });
      avatar.animator.speed = b.vy !== 0 ? 1 : 0;
      return;
    }
    avatar.animator.speed = 1;
    if (b.ground !== null) {
      if (this.prone) avatar.play('prone');
      else if (this.landMs > 0) avatar.play('land', { loop: false });
      else if (Math.abs(b.vx) > 8) avatar.play('run');
      else avatar.play('stand');
      return;
    }
    avatar.play(b.vy < 0 ? 'jump' : 'fall', { loop: false });
  }

  climbTypeOf: (id: number) => 'ladder' | 'rope' = () => 'ladder';

  private climbTag(): string {
    return this.body.climb !== null ? this.climbTypeOf(this.body.climb) : 'ladder';
  }
}
