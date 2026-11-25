// Instant-by-instant pace for the run chart: speed over a
// window of a few tens of seconds (second-by-second GPS is too
// jittery), on moving time. Pure functions.

/** Below this speed (≈ 16:40/km) you are walking or stopped: no pace. */
const MIN_SPEED = 1;

/**
 * Pace (s/km) from a cumulative time/distance track, averaged over `window`
 * seconds centred on the point. Where you walk or are stopped the point is missing,
 * so the line breaks instead of dropping sharply.
 */
export function paceSeries(track: Array<{ t: number; d: number }>, window = 30): Array<{ t: number; v: number }> {
  const points = track.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.d)).sort((a, b) => a.t - b.t);
  if (points.length < 3) return [];
  const half = window / 2;
  const out: Array<{ t: number; v: number }> = [];
  let lo = 0;
  let hi = 0;
  for (const point of points) {
    while (points[lo].t < point.t - half) lo++;
    while (hi < points.length - 1 && points[hi + 1].t <= point.t + half) hi++;
    const dt = points[hi].t - points[lo].t;
    if (dt < half) continue;
    const speed = (points[hi].d - points[lo].d) / dt;
    if (speed < MIN_SPEED) continue;
    out.push({ t: point.t, v: Math.round(1000 / speed) });
  }
  return out;
}
