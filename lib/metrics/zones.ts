// Pure functions: HR zones on heart rate reserve (Karvonen), with the same
// cuts as the Zepp app's "heart rate reserve" zones. PLAN.md §7.
// threshold_i = floor(resting + pct_i * (max_hr - resting))

import type { HrPoint, Profile, TimeInZone, ZoneKey } from "@/lib/types";

/**
 * Lower bound (in % of heart rate reserve) of each zone: these are the cuts
 * of the Zepp heart-rate-reserve zones (Daniels methodology).
 * Z1 easy (easy and long runs; below 59% still counts as Z1),
 * Z2 medium / marathon pace, Z3 threshold, Z4 intervals, Z5 maximal.
 */
export const ZONE_LOWER_PCT: Record<ZoneKey, number> = {
  z1: 0.59,
  z2: 0.74,
  z3: 0.84,
  z4: 0.88,
  z5: 0.95,
};

const ZONE_ORDER: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];

/** Generic cuts in % of max HR: the watch's factory setting. */
const PERCENT_OF_MAX = [0.5, 0.6, 0.7, 0.8, 0.9];

export interface HrZones {
  /** Lower threshold in bpm for each zone. */
  lower: Record<ZoneKey, number>;
  max_hr: number;
  resting_hr: number;
  /** hrr = heart rate reserve computed by the app; watch = zones set on the watch. */
  method: "hrr" | "watch";
}

/** HR config sufficient for the zone calculation. */
export type HrConfig = Pick<Profile, "max_hr" | "resting_hr"> & {
  /** Zepp thresholds: lower limits Z1-Z5 followed by the configured max HR. */
  hr_zone_ranges?: number[] | null;
};

function watchRanges(configured: number[] | null | undefined): number[] | null {
  if (!configured || configured.length < 6) return null;
  const ranges = configured.slice(0, 6);
  const valid = ranges.every((value, index) =>
    Number.isFinite(value)
    && value >= 25
    && value <= 240
    && (index === 0 || value > ranges[index - 1]),
  );
  return valid ? ranges : null;
}

/** True if the watch thresholds are the factory ones in % of max HR. */
export function isPercentOfMaxRanges(ranges: number[]): boolean {
  const max = ranges[5];
  return PERCENT_OF_MAX.every((pct, index) => Math.abs(ranges[index] - pct * max) <= 1.5);
}

/**
 * Lower thresholds (bpm) of the 5 zones.
 *
 * - Zones set on the watch (heart rate reserve, lactate threshold or
 *   custom): used as they are, so app and watch match.
 * - Factory zones in % of max HR: not used, because they ignore resting HR
 *   and put an aerobic run in "Z4". The heart rate reserve is computed
 *   with the Zepp cuts, which gives the same numbers as the Zepp app's
 *   "Reserved heart rate zone" screen.
 * - Without resting HR the watch thresholds remain, if present.
 * Returns null if data is missing (no physiological defaults).
 */
export function hrZones(profile: HrConfig): HrZones | null {
  const ranges = watchRanges(profile.hr_zone_ranges);
  const resting_hr = profile.resting_hr;
  const fromWatch = (values: number[]): HrZones => ({
    lower: {
      z1: Math.round(values[0]),
      z2: Math.round(values[1]),
      z3: Math.round(values[2]),
      z4: Math.round(values[3]),
      z5: Math.round(values[4]),
    },
    max_hr: Math.round(values[5]),
    resting_hr: resting_hr ?? 0,
    method: "watch",
  });

  if (ranges && !isPercentOfMaxRanges(ranges)) return fromWatch(ranges);

  const max_hr = ranges ? Math.round(ranges[5]) : profile.max_hr;
  if (max_hr != null && resting_hr != null && max_hr - resting_hr > 0) {
    const reserve = max_hr - resting_hr;
    const lower = {} as Record<ZoneKey, number>;
    for (const key of ZONE_ORDER) {
      // Zepp truncates to the integer: floor to get the same numbers per beat.
      lower[key] = Math.floor(resting_hr + ZONE_LOWER_PCT[key] * reserve + 1e-9);
    }
    return { lower, max_hr, resting_hr, method: "hrr" };
  }
  return ranges ? fromWatch(ranges) : null;
}

/**
 * HR zone for a single heart rate. Returns null if the zones can't be computed.
 */
export function zoneForHr(bpm: number, profile: HrConfig): ZoneKey | null {
  const zones = hrZones(profile);
  if (!zones) return null;
  // from highest to lowest: the first whose lower threshold is <= bpm
  for (let i = ZONE_ORDER.length - 1; i >= 0; i--) {
    const key = ZONE_ORDER[i];
    if (bpm >= zones.lower[key]) return key;
  }
  return "z1";
}

/**
 * "Zone-from-average" approximation: without an HR stream, assigns the whole duration
 * to the zone of the average HR. Returns null if avg_hr is missing or the zones can't be computed.
 */
export function timeInZoneFromAverage(
  avg_hr: number | null | undefined,
  duration_s: number,
  profile: HrConfig,
): TimeInZone | null {
  if (avg_hr == null) return null;
  const zone = zoneForHr(avg_hr, profile);
  if (!zone) return null;
  return { [zone]: duration_s };
}

/**
 * Computes the time (seconds) in each zone from a real HR series.
 * For each sample adds Δt (distance to the next sample) to the zone of that bpm.
 * Takes precedence over timeInZoneFromAverage when the series is available.
 * Returns null if the series is empty or the zones can't be computed.
 */
export function timeInZoneFromSeries(
  hr_series: HrPoint[],
  profile: HrConfig,
): TimeInZone | null {
  if (!hr_series || hr_series.length < 2) return null;
  const zones = hrZones(profile);
  if (!zones) return null;

  const acc: Partial<Record<ZoneKey, number>> = {};

  for (let i = 0; i < hr_series.length - 1; i++) {
    const dt = hr_series[i + 1].t - hr_series[i].t;
    if (dt <= 0) continue;
    const zone = zoneForHr(hr_series[i].bpm, profile);
    if (!zone) continue;
    acc[zone] = (acc[zone] ?? 0) + dt;
  }

  return Object.keys(acc).length > 0 ? acc : null;
}
