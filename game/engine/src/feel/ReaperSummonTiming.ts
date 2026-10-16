export const REAPER_SKILL = 'skill_0043';

/** 特寫留拍 → 拉遠 → 蓄力 → 唯一一刀 → 靈魂加速連爆 → 留拍終結。 */
export const REAPER_TIMING = {
  lift: 180, gaze: 620, pullback: 1080, reveal: 1640, charge: 1740,
  cut: 2200, cutEnd: 2400, souls: 2440,
  hits: [2580, 2740, 2880, 3000, 3100, 3330], restore: 3500, end: 3880,
} as const;

export const reaperClamp = (value: number): number => Math.max(0, Math.min(1, value));
export function reaperEase(value: number): number {
  const t = reaperClamp(value);
  return t * t * (3 - 2 * t);
}

/** 用固定遊戲時鐘取格，不循環；命中停頓時，抬頭與揮刀也一起停。 */
export function reaperPose(ms: number): { portrait: number; body: number; cut: number; pullback: number } {
  const t = REAPER_TIMING;
  const portrait = ms < t.gaze ? Math.min(3, Math.floor(reaperClamp((ms - t.lift) / (t.gaze - t.lift)) * 4))
    : Math.min(7, 4 + Math.floor((ms - t.gaze) / 95));
  const body = ms < t.charge ? 0 : ms < t.cut ? Math.min(3, 1 + Math.floor((ms - t.charge) / 130))
    : Math.min(7, 4 + Math.floor((ms - t.cut) / 65));
  return { portrait, body, cut: reaperClamp((ms - t.cut) / (t.cutEnd - t.cut)), pullback: reaperEase((ms - t.pullback) / (t.reveal - t.pullback)) };
}
