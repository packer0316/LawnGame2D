const smooth = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** Local 128px artwork coordinates. Face, hands, belt and feet stay pinned. */
export function idleWind(x: number, y: number, elapsedMs: number, outfit: string | null): { x: number; y: number } {
  const t = elapsedMs / 1000;
  const settle = smooth(0, .3, t);
  const hood = outfit === 'hood-1';
  const hair = (1 - smooth(64, 76, y)) * smooth(44, 52, x) * (1 - smooth(79, 85, x));
  const cloth = smooth(hood ? 69 : 72, hood ? 81 : 84, x) * smooth(83, 101, y) * (1 - smooth(110, 117, y));
  // Different wavelengths and a delayed ripple: the fabric tips follow the roots.
  const breeze = Math.sin(t * 2.15 - (y - 85) * .12);
  const ripple = Math.sin(t * 4.1 - (y - 85) * .24 + .8);
  const hairWave = Math.sin(t * 2.65 + (x - 60) * .14);
  const hairStrength = hood ? .2 : 1;
  return {
    x: settle * (hair * hairStrength * (.8 * hairWave + .25 * Math.sin(t * 4.8)) + cloth * (1.9 * breeze + .45 * ripple)),
    y: settle * (hair * hairStrength * .35 * Math.sin(t * 2.65 + .7) + cloth * .65 * Math.sin(t * 2.15 - (y - 85) * .12 + .9)),
  };
}
