import { NO_INPUT, PHYSICS, stepBody, type BodyState, type FootholdWorld, type Rect } from '@lawn/shared';

/** 往前看多遠（腳底中心到探測點）。 */
const LOOKAHEAD = PHYSICS.halfWidth + 4;
/** 前方多近有牆就算擋住。 */
const WALL_GAP = 2;
/** 沿足場往前找時最多跨幾段相接的足場。 */
const MAX_HOPS = 8;

const flip = (dir: 1 | -1): 1 | -1 => (dir === 1 ? -1 : 1);

/**
 * 地面怪往 dir 走一小段會不會出事：走出生怪區、走到平台邊緣、撞牆。
 * 同一條足場上的斜坡照常走（stepBody 本來就沿足場走，任何坡度都上得去）；
 * 只有走出足場、下一段接不上（高低差超過 stepTolerance）才算邊緣。
 */
export function canPatrol(world: FootholdWorld, body: BodyState, dir: 1 | -1, zone: Rect): boolean {
  const probe = body.x + dir * LOOKAHEAD;
  // 生怪區只擋「往外走」：被擊退到區外時要能走回來，不然兩個方向都會被擋
  if (dir === 1 ? probe > zone.x + zone.w : probe < zone.x) return false;
  const to = body.x + dir * WALL_GAP;
  if (Math.abs(world.blockByWalls(body.x, to, body.y - PHYSICS.height, body.y - 2, PHYSICS.halfWidth) - to) > 0.01) return false;
  if (body.ground === null) return true;
  return walkable(world, body.ground, probe);
}

/** 從足場 fh 沿著走到 toX，中間不會掉下去。 */
function walkable(world: FootholdWorld, fh: number, toX: number): boolean {
  let current = fh;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (world.footholdY(current, toX) !== null) return true;
    const range = world.footholdRange(current);
    if (!range) return false;
    const dir = toX > range.x2 ? 1 : -1;
    const edgeX = dir === 1 ? range.x2 : range.x1;
    const edgeY = world.footholdY(current, edgeX);
    if (edgeY === null) return false;
    // 跟 stepBody 走出足場時一樣：邊緣外側、高低差在容許範圍內的相接足場
    const next = world.groundBelow(edgeX + dir * 0.5, edgeY - PHYSICS.stepTolerance, 0, current);
    if (!next || Math.abs(next.y - edgeY) > PHYSICS.stepTolerance) return false;
    current = next.fh;
  }
  return false;
}

/**
 * 地面怪巡邏走一步（固定步長）。前方不能走就轉身；兩邊都不能走就原地站著並回報 stuck，
 * 呼叫端改成發呆，不要每一步左右翻來翻去。
 */
export function patrolStep(world: FootholdWorld, body: BodyState, facing: 1 | -1, speed: number, zone: Rect): { facing: 1 | -1; stuck: boolean } {
  let dir = facing;
  let stuck = false;
  if (speed > 0 && !canPatrol(world, body, dir, zone)) {
    if (canPatrol(world, body, flip(dir), zone)) dir = flip(dir);
    else stuck = true;
  }
  const vx = speed > 0 && !stuck ? speed * dir : 0;
  stepBody(world, body, NO_INPUT, { forcedVx: vx, canClimb: false });
  // 保險：被預料外的東西擋住（地圖邊界）就轉身
  if (vx !== 0 && body.vx === 0) dir = flip(dir);
  return { facing: dir, stuck };
}
