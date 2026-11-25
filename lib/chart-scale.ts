// Pure helpers for the activity trend chart: vertical range and smoothing.

export interface ChartPoint {
  t: number;
  v: number;
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];
}

/**
 * Vertical range of a series. `trim` drops the extreme 2% on each side (a
 * skipped GPS point must not squash the line). `minSpan` keeps small changes
 * small: 20 m of elevation on a 50 m axis look flat, as they are, instead of
 * filling the whole height.
 */
export function axisRange(
  values: number[],
  { trim = false, minSpan = 0, minPad = 1 }: { trim?: boolean; minSpan?: number; minPad?: number } = {},
): { min: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  let min = trim ? quantile(sorted, 0.02) : sorted[0];
  let max = trim ? quantile(sorted, 0.98) : sorted[sorted.length - 1];
  const pad = Math.max((max - min) * 0.12, minPad);
  min -= pad;
  max += pad;
  if (max - min < minSpan) {
    // Grow around the data, keeping it in the lower part like a route profile.
    const extra = minSpan - (max - min);
    min -= extra * 0.35;
    max += extra * 0.65;
  }
  return { min, max };
}

/** Centered moving average over `windowS` seconds (time-based: works with uneven sampling). */
export function smoothSeries(points: ChartPoint[], windowS: number): ChartPoint[] {
  if (windowS <= 0 || points.length < 3) return points;
  const half = windowS / 2;
  const out: ChartPoint[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (const p of points) {
    while (hi < points.length && points[hi].t <= p.t + half) sum += points[hi++].v;
    while (points[lo].t < p.t - half) sum -= points[lo++].v;
    out.push({ t: p.t, v: sum / (hi - lo) });
  }
  return out;
}
