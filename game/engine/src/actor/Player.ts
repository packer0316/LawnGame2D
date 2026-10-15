import {
  PHYSICS,
  createBody,
  stepBody,
  type BodyOptions,
  type BodyState,
  type ClassDef,
  type FootholdWorld,
  type SkillDef,
  type StepEvents,
} from '@lawn/shared';
import type { AvatarView } from '../avatar/AvatarView';

/** 戰鬥手感參數（SPEC §3.4）。 */
export const FEEL = {
  /** 輸入緩衝 */
  bufferMs: 150,
  /** 攻擊動作結束後，多久內按攻擊仍可接下一段連擊 */
  comboGraceMs: 250,
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
  skill1: boolean;
  skill2: boolean;
  roll: boolean;
}

type BufferedAction = 'attack' | 'skill1' | 'skill2' | 'roll' | 'jump';

type State =
  | { kind: 'free' }
  | { kind: 'attack'; skill: SkillDef; elapsed: number; nextStrike: number; duration: number }
  | { kind: 'roll'; elapsed: number; dir: 1 | -1 };

export interface PlayerHooks {
  /** 第 index 刀判定的時間到了 */
  onStrike(skill: SkillDef, index: number): void;
  /** 技能開始前呼叫；回傳 false 表示不能放（例如影襲找不到目標） */
  onSkillStart?(skill: SkillDef): boolean;
  onRoll?(): void;
  onJump?(air: boolean): void;
  onLand?(impact: number): void;
}

export class Player {
  readonly body: BodyState;
  private state: State = { kind: 'free' };
  private nowMs = 0;
  private buffer: { action: BufferedAction; at: number } | null = null;
  private readonly cooldowns = new Map<string, number>();
  private rollCooldownMs = 0;
  private combo: { next: string; until: number } | null = null;
  private landMs = 0;
  private lastFallSpeed = 0;
  private prone = false;
  lastEvents: StepEvents | null = null;

  constructor(
    world: FootholdWorld,
    x: number,
    y: number,
    public classDef: ClassDef,
    private readonly skills: Map<string, SkillDef>,
    /** 動作 Tag 的總長（毫秒） */
    private readonly poseDuration: (tag: string) => number,
    readonly avatar: AvatarView,
    private readonly hooks: PlayerHooks,
  ) {
    this.body = createBody(world, x, y, 1);
  }

  get attacking(): SkillDef | null {
    return this.state.kind === 'attack' ? this.state.skill : null;
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
      ['skill1', input.skill1],
      ['skill2', input.skill2],
      ['roll', input.roll],
      ['jump', input.jumpPressed],
    ];
    for (const [action, pressed] of presses) if (pressed) this.buffer = { action, at: this.nowMs };
    if (this.buffer && this.nowMs - this.buffer.at > FEEL.bufferMs) this.buffer = null;

    let options: BodyOptions = { maxAirJumps: this.classDef.maxAirJumps };
    let jumpPressed = input.jumpPressed;

    if (this.state.kind === 'free') {
      if (this.tryStartBuffered()) return this.step2(world, input, this.optionsForState(), false);
    } else if (this.state.kind === 'attack') {
      const s = this.state;
      s.elapsed += dt;
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
      } else if (s.elapsed >= s.duration) {
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
        jumpHeld: input.jumpHeld,
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
    if (events.fellOut) {
      // 掉出地圖：回到最近的地面（保險）
      this.body.y = 0;
      this.body.vy = 0;
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
      const strike = s.skill.strikes[Math.min(s.nextStrike, s.skill.strikes.length - 1)]!;
      const lunging = s.skill.lunge && Math.abs(s.elapsed - strike.atMs) < 70 && s.nextStrike <= s.skill.strikes.length;
      if (this.body.ground === null) return { ...base, forcedVx: this.body.vx * 0.9, canClimb: false };
      if (lunging) return { ...base, forcedVx: this.body.facing * s.skill.lunge!, canClimb: false };
      return { ...base, rooted: true, canClimb: false };
    }
    return base;
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
    if (buffered.action === 'attack') {
      const chaining =
        (this.state.kind === 'attack' && this.state.skill.comboNext) || (this.combo && this.combo.until >= this.nowMs ? this.combo.next : null);
      skillId = chaining || this.classDef.basic;
    } else {
      skillId = buffered.action === 'skill1' ? this.classDef.skills[0] : this.classDef.skills[1];
    }
    const skill = this.skills.get(skillId);
    if (!skill || (this.cooldowns.get(skillId) ?? 0) > 0) return false;
    if (this.hooks.onSkillStart && !this.hooks.onSkillStart(skill)) {
      this.buffer = null;
      return false;
    }
    this.buffer = null;
    const lastStrike = skill.strikes.at(-1)!.atMs;
    const duration = Math.max(this.poseDuration(skill.pose), lastStrike + 80, skill.cancelFromMs);
    this.state = { kind: 'attack', skill, elapsed: 0, nextStrike: 0, duration };
    if (skill.cooldownSec > 0) this.cooldowns.set(skill.id, skill.cooldownSec * 1000);
    this.combo = null;
    this.avatar.play(skill.pose, { restart: true, loop: duration > this.poseDuration(skill.pose) + 1 });
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
