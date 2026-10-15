import { MAX_JUMP_HEIGHT, PHYSICS, findPath, type Area, type FootholdWorld, type MapDef, type NavGraph, type SkillDef } from '@lawn/shared';
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
  /** 現在放得出去的技能（常駐小技能、技能列）與要按的鍵；ready = 冷卻好了／掉落技能已經到手 */
  skills: readonly AutoSkill[];
}

export interface AutoSkill {
  skill: SkillDef;
  press: Partial<PlayerInput>;
  ready: boolean;
}

/** 自動換房：走得到的怪少於 minMobs 隻，持續 afterMs 就前往下一房（SPEC §3.6） */
export const AUTO_ROOM = { minMobs: 3, afterMs: 8000 } as const;

const IDLE: PlayerInput = { x: 0, up: false, down: false, jumpPressed: false, jumpHeld: false, attack: false, secondary: false, skill: -1, roll: false };
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
    case 'path':
      return area.w ?? 40;
    case 'map':
      return 4000;
  }
}

/** 技能打得到多遠：第一刀的範圍，加上往前的衝刺／瞬移距離。 */
function skillReach(skill: SkillDef): number {
  const move = skill.move;
  const travel = move?.kind === 'dash' ? Math.max(0, move.distance) : move?.kind === 'blink' ? move.distance : move?.kind === 'leap' ? Math.max(0, move.vx) * 0.6 : 0;
  return reachOf(skill.strikes[0]!.area) + travel;
}

/** 換目標的門檻：新的打怪點分數要超過目前目標的幾倍才換（避免兩群差不多時來回跑）。 */
const SWITCH_RATIO = 1.25;
/** 到了打怪點之後大約要花多久出手、清怪（秒）；分數的分母加上這段，近的單隻怪才不會永遠贏過遠一點的一群。 */
const ENGAGE_SEC = 1.2;
/** 「附近」的範圍：同一足場這個距離內的怪，打完眼前這群可以接著打，算一部分價值。 */
const NEAR_PX = 260;
/** 遠程職業也走到這個距離內才打：站進怪群裡，兩側都打得到、範圍技能放得到，不會停在出生點遠遠地射。 */
const STAND_OFF_PX = 150;

/** 跟目標保持多遠就可以出手。 */
const standOff = (reach: number): number => Math.max(8, Math.min(reach * 0.7, STAND_OFF_PX));

/** 一條路線：估計秒數、抵達足場時的 x、第一條要走的邊（出發點為 null）。 */
interface Route {
  time: number;
  x: number;
  first: Edge | null;
}

/** 足場在 x 的高度；x 超出足場範圍時取最近的端點。 */
function yOn(world: FootholdWorld, fh: number, x: number): number {
  const range = world.footholdRange(fh);
  if (!range) return 0;
  return world.footholdY(fh, Math.max(range.x1, Math.min(range.x2, x))) ?? 0;
}

/** 走一條邊大約要幾秒（不含走到起跳點）：跳、落下、爬繩照高低差估。 */
function edgeSeconds(world: FootholdWorld, edge: Edge, x: number): number {
  const drop = yOn(world, edge.to, x) - yOn(world, edge.from, x);
  const fall = Math.sqrt((2 * Math.max(0, drop)) / PHYSICS.gravity);
  switch (edge.type) {
    case 'run':
      return 0.1;
    case 'roll':
      return 0.4;
    case 'drop':
      return 0.25 + fall;
    case 'jump':
      return 0.8 + fall;
    case 'climb':
      return 0.3 + Math.abs(drop) / PHYSICS.climbSpeed;
    case 'portal':
      return 2;
  }
}

/** 走完一條邊大約落在目標足場的哪裡。 */
function landingX(world: FootholdWorld, edge: Edge, takeoff: number): number {
  const ahead = edge.type === 'jump' ? 56 : edge.type === 'climb' || edge.type === 'portal' ? 0 : 20;
  const x = takeoff + (edge.dir ?? 0) * ahead;
  const range = world.footholdRange(edge.to);
  return range ? Math.max(range.x1, Math.min(range.x2, x)) : x;
}

/** 技能往後退多遠（後撤射擊、後空翻）；不往後退回傳 0。 */
function backoffOf(skill: SkillDef): number {
  const move = skill.move;
  if (move?.kind === 'dash') return Math.max(0, -move.distance);
  if (move?.kind === 'leap') return Math.max(0, -move.vx) * 0.6;
  return 0;
}

/** 技能第一刀的上下範圍（相對身體中心）。 */
function heightOf(area: Area): number {
  if (area.shape === 'circle' || area.shape === 'sector') return (area.r ?? 0) * 2;
  if (area.shape === 'screen') return 540;
  if (area.shape === 'map') return 4000;
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
  /** 目前目標的打怪點分數（每秒打得到的價值） */
  private targetScore = 0;
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
      targetScore: Math.round(this.targetScore * 100) / 100,
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
    this.targetScore = 0;
    this.leaving = false;
    this.blacklist.clear();
    this.looseClimb = null;
    this.status = 'search';
  }

  step(ctx: AutoContext): PlayerInput {
    // GameScene 傳的是 Map.values()，只能走訪一次；選怪、站位、判斷放技能都要走好幾次，先收成陣列
    ctx = { ...ctx, monsters: [...ctx.monsters] };
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
      // 跟選怪用同一套「以時間計」的路線：選的時候估多遠，就照那條路走
      const edge = this.routes(ctx).get(goal)?.first;
      if (!edge) return this.giveUp(this.target);
      this.run = this.startEdge(ctx, edge);
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
    const aim = ctx.basic.projectile?.aim;
    const dx = Math.abs(box.x + box.w / 2 - ctx.player.body.x);
    const coneY = aim && dx <= aim.range ? dx * Math.tan((aim.coneDeg * Math.PI) / 180) * 0.9 : 0;
    const reachY = Math.max(heightOf(area) / 2, coneY) + box.h / 2 - 2;
    if (Math.abs(dy) <= reachY) return 0;
    return dy > 0 ? dy - reachY : -1;
  }

  /**
   * 選打怪點：每隻走得到的怪都是一個候選點。價值 = 站在牠旁邊、面向怪多的一側時普攻打得到的怪，
   * 再加上同足場附近的怪（打完這群可以接著打）；成本 = 沿導航圖估的移動秒數。
   * 分數 = 價值 ÷（移動秒數 + 出手時間），也就是「每秒打得到多少」，所以會往怪多的地方走，
   * 不會只顧著打最近的一隻、一直在出生點附近繞。目前目標要被明顯超過才換。
   */
  private pickTarget(ctx: AutoContext): void {
    const body = ctx.player.body;
    if (body.ground === null) return;
    const routes = this.routes(ctx);
    const reach = reachOf(ctx.basic.strikes[0]!.area);
    const window = Math.max(70, Math.min(220, reach));
    const byFoothold = new Map<number, MonsterActor[]>();
    this.reachableCount = 0;
    for (const m of ctx.monsters) {
      if (!m.alive || (this.blacklist.get(m.spawn.uid) ?? 0) > this.clock) continue;
      const fh = this.footholdOf(ctx, m);
      if (fh === null || !routes.has(fh)) continue;
      this.reachableCount += 1;
      const list = byFoothold.get(fh);
      if (list) list.push(m);
      else byFoothold.set(fh, [m]);
    }
    let best: { m: MonsterActor; score: number } | null = null;
    let current = -Infinity;
    for (const [fh, list] of byFoothold) {
      const route = routes.get(fh)!;
      for (const m of list) {
        // 遠程職業站在射程內就能打，不用走到怪旁邊
        const walk = Math.max(0, Math.abs(m.x - route.x) - standOff(reach)) / PHYSICS.runSpeed;
        const score = this.spotValue(m, list, window) / (route.time + walk + (m.flying ? 0.6 : 0) + ENGAGE_SEC);
        if (m === this.target) current = score;
        if (!best || score > best.score) best = { m, score };
      }
    }
    if (this.target && current > 0 && current * SWITCH_RATIO >= (best?.score ?? 0)) {
      this.targetScore = current;
      return;
    }
    if (best?.m !== this.target) this.stuckMs = 0;
    this.target = best?.m ?? null;
    this.targetScore = best?.score ?? 0;
  }

  /** 站在 m 旁邊、面向怪多的一側時打得到的價值（依策略加權）；同足場 NEAR_PX 內的其他怪算一部分。 */
  private spotValue(m: MonsterActor, sameFoothold: MonsterActor[], window: number): number {
    let right = 0;
    let left = 0;
    let near = 0;
    for (const other of sameFoothold) {
      const dx = other.x - m.x;
      const weight = this.weightOf(other);
      if (dx >= -8 && dx <= window) right += weight;
      if (dx <= 8 && dx >= -window) left += weight;
      if (Math.abs(dx) <= NEAR_PX) near += weight;
    }
    const hit = Math.max(right, left);
    const around = near - hit;
    const self = this.weightOf(m);
    switch (this.config.strategy) {
      case 'nearest':
        // 最近：距離為主，但順路的一群還是比落單的一隻值得
        return self + 0.6 * (hit - self) + 0.25 * around;
      case 'densest':
        return hit + 0.6 * around;
      case 'highest':
        return hit + 0.3 * around;
    }
  }

  /**
   * 一隻怪的價值。最高倍率：照倍率。其他策略：高倍率的怪很難打死（擊殺機率約 1／倍率），只算一部分，
   * 不然一群打不死的菁英會把角色一直綁在同一個地方。
   */
  private weightOf(m: MonsterActor): number {
    if (this.config.strategy === 'highest') return m.spawn.multiplier;
    return Math.max(0.25, Math.min(1, 4 / m.spawn.multiplier));
  }

  /** 從目前位置沿導航圖到每個足場：估計秒數、抵達時的 x、第一條要走的邊。以時間計，會算進走到起跳點的距離。 */
  private routes(ctx: AutoContext): Map<number, Route> {
    const body = ctx.player.body;
    const start = body.ground!;
    const best = new Map<number, Route>([[start, { time: 0, x: body.x, first: null }]]);
    const open = new Set<number>([start]);
    while (open.size > 0) {
      let fh = -1;
      for (const id of open) if (fh < 0 || best.get(id)!.time < best.get(fh)!.time) fh = id;
      open.delete(fh);
      const from = best.get(fh)!;
      for (const edge of ctx.nav.edges) {
        if (edge.from !== fh) continue;
        const takeoff = edge.x ?? from.x;
        const time = from.time + Math.abs(takeoff - from.x) / PHYSICS.runSpeed + edgeSeconds(ctx.world, edge, takeoff);
        if (time >= (best.get(edge.to)?.time ?? Infinity)) continue;
        best.set(edge.to, { time, x: landingX(ctx.world, edge, takeoff), first: from.first ?? edge });
        open.add(edge.to);
      }
    }
    return best;
  }

  /** 同一個足場：走進射程、面向目標、出招。 */
  private engage(ctx: AutoContext, dt: number): PlayerInput {
    const body = ctx.player.body;
    const target = this.target!;
    const box = target.hitbox();
    const cx = box.x + box.w / 2;
    let dir: 1 | -1 = cx >= body.x ? 1 : -1;
    const reach = reachOf(ctx.basic.strikes[0]!.area);
    const gap = Math.max(0, Math.abs(cx - body.x) - box.w / 2);

    // 遠程：站在怪群邊緣（另一側沒有怪）時，先走進怪群中間，兩側都打得到、範圍技能放得到；
    // 已經在怪群裡就不再挪，免得一直走來走去少打幾下
    if (reach > STAND_OFF_PX) {
      const spot = this.clusterCenter(ctx, target);
      if (spot !== null && Math.abs(spot - body.x) > 60 && gap < reach * 0.9) {
        const toward: 1 | -1 = spot > body.x ? 1 : -1;
        if (this.countAhead(ctx, toward === 1 ? -1 : 1, reach) === 0) {
          if (this.trackStuck(body.x, dt)) return this.giveUp(target);
          return input({ x: toward });
        }
      }
    }
    if (gap > standOff(reach)) {
      if (this.trackStuck(body.x, dt)) return this.giveUp(target);
      return input({ x: dir });
    }
    this.stuckMs = 0;
    // 站位：身後打得到的怪比面前多就轉過去打（目標之後再回頭打）
    const back: 1 | -1 = dir === 1 ? -1 : 1;
    if (this.countAhead(ctx, back, reach) > this.countAhead(ctx, dir, reach)) dir = back;
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
      const behind = this.roomBehind(ctx);
      const keepWithin = standOff(reach) + 40;
      for (const { skill, press, ready } of ctx.skills) {
        if (!ready) continue;
        // 往後退的技能（後撤射擊、後空翻）：身後要有空間，退完也還在出手距離內才放。
        // 不然每放一次就要走回來，遠程職業會被一路推回牆角，或從平台邊緣掉下去
        const backoff = backoffOf(skill);
        if (backoff > 0 && (behind < backoff + 40 || gap + backoff > keepWithin)) continue;
        const strike = skill.strikes[0]!;
        const reach = skillReach(skill);
        const inRange = [...ctx.monsters].filter((m) => m.alive && (m.x - body.x) * body.facing >= -60 && Math.abs(m.x - body.x) <= reach + 20 && Math.abs(m.y - body.y) < 80).length;
        const worth = inRange >= 1 && (strike.maxTargets <= 1 || skill.chain !== undefined || inRange >= 2 || target.math?.tier === 'elite' || target.math?.tier === 'boss');
        if (worth) return input(press);
      }
    }
    return input({ attack: true });
  }

  /** 目標附近（同足場 NEAR_PX 內）怪群的中位數 x，夾在足場範圍內；角色不在足場上時回傳 null。 */
  private clusterCenter(ctx: AutoContext, target: MonsterActor): number | null {
    const ground = ctx.player.body.ground;
    const range = ground !== null ? ctx.world.footholdRange(ground) : null;
    if (!range) return null;
    const xs: number[] = [];
    for (const m of ctx.monsters) {
      if (m.alive && Math.abs(m.x - target.x) <= NEAR_PX && this.footholdOf(ctx, m) === ground) xs.push(m.x);
    }
    if (xs.length === 0) return null;
    xs.sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)]!;
    return Math.max(range.x1 + 24, Math.min(range.x2 - 24, median));
  }

  /** 身後（背對的方向）還能退多遠：到足場盡頭或牆。 */
  private roomBehind(ctx: AutoContext): number {
    const body = ctx.player.body;
    const range = body.ground !== null ? ctx.world.footholdRange(body.ground) : null;
    if (!range) return 0;
    const back = body.facing === 1 ? -1 : 1;
    const edge = back === 1 ? range.x2 : range.x1;
    const wall = ctx.world.blockByWalls(body.x, edge, body.y - PHYSICS.height, body.y - 2, PHYSICS.halfWidth);
    return Math.abs(wall - body.x);
  }

  /** 面向 dir 時普攻打得到幾隻（水平在射程內、高度在判定範圍內）。 */
  private countAhead(ctx: AutoContext, dir: 1 | -1, reach: number): number {
    const body = ctx.player.body;
    const half = heightOf(ctx.basic.strikes[0]!.area) / 2 + 12;
    let count = 0;
    for (const m of ctx.monsters) {
      if (!m.alive) continue;
      const box = m.hitbox();
      const dx = (box.x + box.w / 2 - body.x) * dir;
      if (dx >= -box.w / 2 && dx <= reach + box.w / 2 && Math.abs(box.y + box.h / 2 - (body.y - 24)) <= half + box.h / 2) count += 1;
    }
    return count;
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
    // 保險：走的不是爬繩的邊卻掛在繩上，朝目標足場爬（跑、跳、下跳的輸入在繩上都沒作用，會乾等到逾時）
    if (body.climb !== null && edge.type !== 'climb') {
      const toY = ctx.world.footholdY(edge.to, edge.x ?? body.x);
      return input(toY !== null && toY < body.y ? { up: true } : { down: true });
    }

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
