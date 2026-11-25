// Pace adjustment for heat and humidity. Pure functions.
// Uses the sum of temperature + dew point in °F (table popularised by Mark
// Hadley): below 100 no effect, then a growing slowdown. The table
// alone already kicks in at a very humid 20°: we run by the athlete's feel
// and adapt only when it is really hot.

import type { WorkoutStepInput } from "@/lib/types";

const TABLE: Array<[number, number]> = [
  [100, 0],
  [110, 0.5],
  [120, 1],
  [130, 2],
  [140, 3],
  [150, 4.5],
  [160, 6],
  [170, 8],
  [180, 10],
];

const toF = (celsius: number) => (celsius * 9) / 5 + 32;

/** Below this air temperature no adjustment, even if humid. */
export const HEAT_MIN_TEMP_C = 24;
/** Below this threshold the effect is negligible (a few seconds per km). */
const MIN_PCT = 2;
/** From this dew point the air feels humid. */
export const HUMID_DEW_POINT_C = 16;

/** Recommended slowdown percentage (0 = no adjustment). */
export function heatSlowdownPct(tempC: number, dewPointC: number): number {
  if (!(tempC >= HEAT_MIN_TEMP_C)) return 0;
  const sum = toF(tempC) + toF(dewPointC);
  if (!Number.isFinite(sum) || sum <= TABLE[0][0]) return 0;
  const last = TABLE[TABLE.length - 1];
  if (sum >= last[0]) return 12;
  for (let i = 1; i < TABLE.length; i++) {
    const [x1, y1] = TABLE[i];
    if (sum <= x1) {
      const [x0, y0] = TABLE[i - 1];
      const pct = Math.round((y0 + ((sum - x0) / (x1 - x0)) * (y1 - y0)) * 10) / 10;
      return pct < MIN_PCT ? 0 : pct;
    }
  }
  return 12;
}

export function adjustPace(pace: number | null, pct: number): number | null {
  if (pace == null || pct <= 0) return pace;
  return Math.min(1_200, Math.round(pace * (1 + pct / 100)));
}

/** Same steps with the pace ranges slowed by the given percentage. */
export function adjustStepsForHeat<S extends WorkoutStepInput>(steps: S[], pct: number): S[] {
  if (pct <= 0) return steps;
  return steps.map((step) => ({
    ...step,
    pace_min_s_km: adjustPace(step.pace_min_s_km, pct),
    pace_max_s_km: adjustPace(step.pace_max_s_km, pct),
  }));
}

/** Seconds per km of slowdown for a reference pace. */
export function heatDeltaSeconds(referencePace: number, pct: number): number {
  return Math.round((referencePace * pct) / 100);
}
