import { MAX_JUMP_HEIGHT, PHYSICS, findPath, navDistances, type Area, type FootholdWorld, type MapDef, type NavGraph, type SkillDef } from '@lawn/shared';
import type { Player, PlayerInput } from '../actor/Player';
import type { MonsterActor } from '../monster/MonsterActor';

/**
 * 自動掛機（SPEC §3.6）：選怪 → 沿導航圖尋路 → 進入射程 → 攻擊；本房沒怪時可自動走去下一房傳送點。
 * 產出的是跟鍵盤一樣的 PlayerInput，所以掛機跟手動遵守同一套物理與攻速上限。
 */

type Edge = NavGraph['edges'][number];

export interface AutoConfig {
  strategy: 'nearest' | 'highest' | 'densest';
  useSkills: boolean;
  autoRoom: boolean;
  stop: {
    /** 餘額低於 */
    balanceBelow: number | null;
    /** 本次累計輸 ≥ */
    lossAtLeast: number | null;
    /** 本次累計贏 ≥ */
    winAtLeast: number | null;
    /** 單次派彩 ≥ 幾倍 */
    payoutMultipleAtLeast: number | null;
    /** 掛機時間（分鐘） */
    minutes: number | null;
  };
}

export const DEFAULT_AUTO_CONFIG: AutoConfig = {
  strategy: 'nearest',
  useSkills: true,
  autoRoom: false,
  stop: { balanceBelow: null, lossAtLeast: null, winAtLeast: null, payoutMultipleAtLeast: null, minutes: null },
};

export type AutoStatus = 'search' | 'travel' | 'attack' | 'portal';

export interface AutoContext {
  world: FootholdWorld;
  nav: NavGraph;
  map: MapDef;
  player: Player;
  monsters: Iterable<MonsterActor>;
  basic: SkillDef;
  skills: readonly (SkillDef | undefined)[];
}

/** 自動換房：走得到的怪少於 minMobs 隻，持續 afterMs 就前往下一房（SPEC §3.6） */
export const AUTO_ROOM = { minMobs: 3, afterMs: 8000 } as const;

const IDLE: PlayerInput = { x: 0, up: false, down: false, jumpPressed: false, jumpHeld: false, attack: false, skill1: false, skill2: false, roll: false };
const input = (patch: Partial<PlayerInput>): PlayerInput => ({ ...IDLE, ...patch });

/** 技能第一刀往前打得到多遠（水平）。 */
function reachOf(area: Area): number {
  switch (area.shape) {
    case 'rect':
    case 'line':
      return (area.offsetX ?? 0) + (area.w ?? 0);
    case 'circle':
    case 'sector':
      return area.r ?? 0;
    case 'screen':
      return 400;
  }
}

/** 技能第一刀的上下範圍（相對身體中心）。 */
function heightOf(area: Area): number {
  if (area.shape === 'circle' || area.shape === 'sector') return (area.r ?? 0) * 2;
  if (area.shape === 'screen') return 540;
  return area.h ?? 28;
}

interface EdgeRun {
  edge: Edge;
  phase: 'approach' | 'act';
  ms: number;
  started: boolean;
  left: boolean;
  /** climb：往上爬（出發時就決定，爬到頂端附近也不會反悔） */
  up: boolean;
}

export class AutoHunt {
  config: AutoConfig = structuredClone(DEFAULT_AUTO_CONFIG);
  status: AutoStatus = 'search';
  private target: MonsterActor | null = null;
  private run: EdgeRun | null = null;
  private retargetMs = 0;
  private stuckMs = 0;
  private lastX = 0;
  /** 走得到的怪太少持續多久 */
  private sparseMs = 0;
  private reachableCount = 0;
  /** 已決定前往下一房 */
  private leaving = false;
  private clock = 0;
  private readonly blacklist = new Map<number, number>();
  /** 沒有進行中的邊卻掛在繩上：往哪個方向爬下來 */
  private looseClimb: { up: boolean; lastY: number; stillMs: number } | null = null;

  /** 除錯用（scripts 讀 __lawnStats）：目前目標與正在走的邊。 */
  debugInfo(): Record<string, number> {
    const t = this.target;
    return {
      targetUid: t?.spawn.uid ?? -1,
      targetX: Math.round(t?.x ?? -1),
      targetY: Math.round(t?.y ?? -1),
      targetFh: t?.foothold ?? -1,
      edgeTo: this.run?.edge.to ?? -1,
      blacklisted: [...this.blacklist.values()].filter((until) => until > this.clock).length,
    };
  }

  /** 換房、開關掛機時清掉進行中的狀態。 */
  reset(): void {
    this.target = null;
    this.run = null;
    this.retargetMs = 0;
    this.stuckMs = 0;
    this.sparseMs = 0;
    this.reachableCount = 0;
    this.leaving = false;
    this.blacklist.clear();
    this.looseClimb = null;
    this.status = 'search';
  }

  step(ctx: AutoContext): PlayerInput {
    const dt = PHYSICS.dt * 1000;
    this.clock += dt;
    const body = ctx.player.body;

    if (this.run) return this.runEdge(ctx, dt);
    if (body.climb !== null) return this.leaveClimb(body.y, dt);
    this.looseClimb = null;
    if (body.ground === null) {
      // 空中：跳起來打高處的怪，到得了高度就出手；其他情況等落地
      const reachable = this.target?.alive && this.verticalGap(ctx, this.target) === 0;
      return input({ jumpHeld: true, attack: !!reachable && body.climb === null });
    }

    if (this.leaving) return this.goToPortal(ctx);

    this.retargetMs -= dt;
    if (!this.target || !this.target.alive || this.retargetMs <= 0) {
      this.pickTarget(ctx);
      this.retargetMs = 1200;
    }
    if (this.config.autoRoom && this.reachableCount < AUTO_ROOM.minMobs) {
      this.sparseMs += dt;
      if (this.sparseMs >= AUTO_ROOM.afterMs) {
        this.leaving = true;
        this.target = null;
        return this.goToPortal(ctx);
      }
    } else {
      this.sparseMs = 0;
    }
    if (!this.target) {
      this.status = 'search';
      return IDLE;
    }

    const goal = this.footholdOf(ctx, this.target);
    if (goal === null) return this.giveUp(this.target);
    if (body.ground !== goal) {
      const path = findPath(ctx.nav, body.ground, goal);
      if (!path || path.length === 0) return this.giveUp(this.target);
      this.run = this.startEdge(ctx, path[0]!);
      this.status = 'travel';
      return this.runEdge(ctx, dt);
    }
    this.status = 'attack';
    return this.engage(ctx, dt);
  }

  // ---------------------------------------------------------------------------

  private startEdge(ctx: AutoContext, edge: Edge): EdgeRun {
    const x = edge.x ?? ctx.player.body.x;
    const fromY = ctx.world.footholdY(edge.from, x) ?? ctx.player.body.y;
    const toY = ctx.world.footholdY(edge.to, x) ?? fromY;
    return { edge, phase: 'approach', ms: 0, started: false, left: false, up: toY < fromY };
  }

  /** 掛在繩上卻沒有要走的邊（例如中途放棄）：先往上爬，爬不動就往下。 */
  private leaveClimb(y: number, dt: number): PlayerInput {
    const loose = (this.looseClimb ??= { up: true, lastY: y, stillMs: 0 });
    if (Math.abs(y - loose.lastY) < 0.5) loose.stillMs += dt;
    else loose.stillMs = 0;
    loose.lastY = y;
    if (loose.stillMs > 300) {
      loose.up = !loose.up;
      loose.stillMs = 0;
    }
    return input(loose.up ? { up: true } : { down: true });
  }

  private giveUp(target: MonsterActor | null): PlayerInput {
    if (target) this.blacklist.set(target.spawn.uid, this.clock + 5000);
    this.target = null;
    this.run = null;
    this.stuckMs = 0;
    return IDLE;
  }

  /** 怪物所在的足場；被擊飛在空中時取正下方。飛行怪取正下方、跳起來打得到的足場。 */
  private footholdOf(ctx: AutoContext, monster: MonsterActor): number | null {
    if (!monster.flying) return monster.foothold ?? ctx.world.groundBelow(monster.x, monster.y - 2)?.fh ?? null;
    const below = ctx.world.groundBelow(monster.x, monster.y);
    return below && below.y - monster.y <= MAX_JUMP_HEIGHT ? below.fh : null;
  }

  /** 普攻判定的上下範圍差多少才碰得到目標（0 = 碰得到；正數 = 目標偏高）。 */
  private verticalGap(ctx: AutoContext, monster: MonsterActor): number {
    const box = monster.hitbox();
    const area = ctx.basic.strikes[0]!.area;
    const dy = ctx.player.body.y - 24 - (box.y + box.h / 2);
    const reachY = heightOf(area) / 2 + box.h / 2 - 2;
    if (Math.abs(dy) <= reachY) return 0;
    return dy > 0 ? dy - reachY : -1;
  }

  private pickTarget(ctx: AutoContext): void {
    const body = ctx.player.body;
    if (body.ground === null) return;
    const dist = navDistances(ctx.nav, body.ground);
    const alive = [...ctx.monsters].filter((m) => m.alive);
    let best: { m: MonsterActor; score: number } | null = null;
    this.reachableCount = 0;
    for (const m of alive) {
      if ((this.blacklist.get(m.spawn.uid) ?? 0) > this.clock) continue;
      const fh = this.footholdOf(ctx, m);
      if (fh === null) continue;
      const cost = dist.get(fh);
      if (cost === undefined) continue;
      this.reachableCount += 1;
      // 換算成「要跑多少像素」：每條邊的成本 ≈ 一次跳躍 ≈ 跑 80 像素
      const travel = cost * 80 + Math.abs(m.x - body.x);
      let score: number;
      if (this.config.strategy === 'highest') score = -m.spawn.multiplier * 400 + travel;
      else if (this.config.strategy === 'densest') score = -alive.filter((o) => Math.abs(o.x - m.x) < 110 && Math.abs(o.y - m.y) < 60).length * 240 + travel;
      else score = travel;
      // 目前的目標加分，避免兩隻差不多遠時來回換
      if (m === this.target) score -= 60;
      if (!best || score < best.score) best = { m, score };
    }
    if (best?.m !== this.target) this.stuckMs = 0;
    this.target = best?.m ?? null;
  }

  /** 同一個足場：走進射程、面向目標、出招。 */
  private engage(ctx: AutoContext, dt: number): PlayerInput {
    const body = ctx.player.body;
    const target = this.target!;
    const box = target.hitbox();
    const cx = box.x + box.w / 2;
    const dir: 1 | -1 = cx >= body.x ? 1 : -1;
    const reach = reachOf(ctx.basic.strikes[0]!.area);
    const gap = Math.max(0, Math.abs(cx - body.x) - box.w / 2);

    if (gap > Math.max(8, reach * 0.7)) {
      if (this.trackStuck(body.x, dt)) return this.giveUp(target);
      return input({ x: dir });
    }
    this.stuckMs = 0;
    if (body.facing !== dir) return input({ x: dir });

    // 目標在頭上：跳得到就跳起來打（空中出手在 step() 開頭處理），跳不到就換目標
    const high = this.verticalGap(ctx, target);
    if (high !== 0) {
      // 頭上有單向平台時起跳會落在平台上：差一點點就直接砍（判定框有餘裕），差太多就換目標
      const above = ctx.world.groundBelow(body.x, body.y - MAX_JUMP_HEIGHT - 4);
      const blocked = above !== null && above.fh !== body.ground && above.y < body.y - 4;
      if (high > 0 && high < MAX_JUMP_HEIGHT * 0.85 && !blocked) return ctx.player.attacking ? IDLE : input({ jumpPressed: true, jumpHeld: true });
      if (high > 0 && high < 16) return input({ attack: true });
      return this.giveUp(target);
    }

    if (this.config.useSkills) {
      for (const [i, skill] of ctx.skills.entries()) {
        if (!skill || !ctx.player.canUse(skill.id)) continue;
        const strike = skill.strikes[0]!;
        const inRange = [...ctx.monsters].filter((m) => m.alive && Math.abs(m.x - body.x) <= reachOf(strike.area) + 20 && Math.abs(m.y - body.y) < 80).length;
        const worth = strike.maxTargets <= 1 || inRange >= 2 || target.math?.tier === 'elite' || target.math?.tier === 'boss';
        if (worth) return input(i === 0 ? { skill1: true } : { skill2: true });
      }
    }
    return input({ attack: true });
  }

  /** 執行導航圖的一條邊：先走到起跳點，再跑／跳／下跳／爬。 */
  private runEdge(ctx: AutoContext, dt: number): PlayerInput {
    const run = this.run!;
    const { edge } = run;
    const body = ctx.player.body;
    // 出招中不能起跳：等這一刀結束
    if (ctx.player.attacking) return IDLE;
    run.ms += dt;
    if (run.ms > 6000) {
      this.abandonEdge();
      return this.giveUp(this.target);
    }

    // 抵達目標足場
    if (body.ground === edge.to && body.climb === null) {
      this.run = null;
      this.stuckMs = 0;
      return IDLE;
    }

    if (run.phase === 'approach') {
      if (body.climb !== null) return input({ up: true });
      if (body.ground === null) return input({ jumpHeld: true });
      if (body.ground !== edge.from) return this.abandonEdge();
      const takeoff = edge.x ?? body.x;
      const dx = takeoff - body.x;
      if (Math.abs(dx) > 3) {
        if (this.trackStuck(body.x, dt)) return this.abandonEdge();
        return input({ x: dx > 0 ? 1 : -1 });
      }
      // 導航圖是從靜止起跳模擬的：先停穩再跳
      if (Math.abs(body.vx) > 20) return IDLE;
      run.phase = 'act';
      this.stuckMs = 0;
    }

    if (body.ground === null && body.climb === null) run.left = true;
    // 落在別的足場：重新規劃
    if (run.left && body.ground !== null && body.ground !== edge.to) return this.abandonEdge();

    const dir = edge.dir ?? 0;
    switch (edge.type) {
      case 'run':
      case 'roll':
        return input({ x: dir === 0 ? 1 : dir });
      case 'jump':
        if (!run.started) {
          run.started = true;
          return input({ x: dir, jumpPressed: true, jumpHeld: true });
        }
        return input({ x: dir, jumpHeld: true });
      case 'drop':
        if (dir === 0) {
          if (!run.started) {
            run.started = true;
            return input({ down: true, jumpPressed: true });
          }
          return IDLE;
        }
        return input({ x: dir });
      case 'climb': {
        if (!run.up) return input({ down: true });
        if (body.climb === null && body.ground !== null && !run.started) {
          // 懸空的繩子：跳起來抓（空中按住 ↑ 碰到繩尾就會抓住）
          const rope = ctx.world.climbables.find((c) => Math.abs(c.x - body.x) <= PHYSICS.climbGrab && c.yTop < body.y);
          if (rope && rope.yBottom < body.y - 4) {
            run.started = true;
            return input({ up: true, jumpPressed: true, jumpHeld: true });
          }
        }
        return input({ up: true, jumpHeld: true });
      }
      case 'portal':
        return input({ up: true });
    }
  }

  private abandonEdge(): PlayerInput {
    this.run = null;
    this.stuckMs = 0;
    this.retargetMs = 0;
    return IDLE;
  }

  /** 想移動卻 1.5 秒沒前進：卡住了。 */
  private trackStuck(x: number, dt: number): boolean {
    if (Math.abs(x - this.lastX) > 1) {
      this.lastX = x;
      this.stuckMs = 0;
      return false;
    }
    this.stuckMs += dt;
    return this.stuckMs > 1500;
  }

  /** 本房走得到的怪太少：走去「下一房」傳送點並按 ↑。 */
  private goToPortal(ctx: AutoContext): PlayerInput {
    const body = ctx.player.body;
    const portal = ctx.map.portals.find((p) => p.type === 'next');
    const ground = portal ? ctx.world.groundBelow(portal.x, portal.y - 24) : null;
    const path = ground && body.ground !== null ? findPath(ctx.nav, body.ground, ground.fh) : null;
    if (!portal || !ground || !path) {
      // 沒有下一房傳送點或走不到：繼續在本房打
      this.leaving = false;
      this.sparseMs = 0;
      return IDLE;
    }
    this.status = 'portal';
    if (path.length > 0) {
      this.run = this.startEdge(ctx, path[0]!);
      return this.runEdge(ctx, PHYSICS.dt * 1000);
    }
    const dx = portal.x - body.x;
    if (Math.abs(dx) > 8) return input({ x: dx > 0 ? 1 : -1 });
    return input({ up: true });
  }
}
