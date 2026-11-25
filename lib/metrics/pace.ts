// Pure function: average pace. PLAN.md §7.
// The LLM never produces this number — it can be rebuilt from the runs.

/**
 * Average pace in seconds per km.
 * @param distance_m distance in metres (> 0)
 * @param duration_s total duration in seconds (> 0)
 * @returns seconds/km rounded to the integer
 */
export function avgPace(distance_m: number, duration_s: number): number {
  if (distance_m <= 0 || duration_s <= 0) {
    throw new Error("avgPace: distance_m e duration_s devono essere positivi");
  }
  return Math.round(duration_s / (distance_m / 1000));
}
