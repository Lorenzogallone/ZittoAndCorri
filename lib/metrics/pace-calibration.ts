// Pure function: pace ↔ HR calibration. PLAN.md §7.
// Answers the question "is the athlete's easy pace really easy?" in a
// deterministic way, comparing the average HR of recent runs with the zone
// expected for that session type. The result goes into the coach prompt:
// so if easy runs come out of Z1 the next plan remembers it.

import { hrZones, zoneForHr, type HrConfig } from "./zones.ts";
import type { ActivityType, WorkoutType, ZoneKey } from "@/lib/types";

/** Maximum HR zone expected for each type of running session. */
// Zones like Zepp: Z1 easy, Z2 moderate, Z3 threshold, Z4 repeats, Z5 maximal.
const EXPECTED_MAX_ZONE: Partial<Record<WorkoutType, ZoneKey>> = {
  recovery: "z1",
  easy: "z1",
  long: "z1",
  tempo: "z3",
  interval: "z5",
  race: "z5",
};

const ZONE_INDEX: Record<ZoneKey, number> = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5 };
const NEXT_ZONE: Partial<Record<ZoneKey, ZoneKey>> = { z1: "z2", z2: "z3", z3: "z4", z4: "z5" };

/**
 * Beats above the expected zone limit that remain a detail: 2-3 bpm
 * above Z1 in an easy run don't make the run "too hard".
 */
export const HR_TOLERANCE_BPM = 3;

export interface PaceCalibrationEntry {
  type: WorkoutType;
  /** Runs considered. */
  runs: number;
  /** Observed average pace (s/km). */
  avg_pace_s_km: number;
  /** Observed average HR (bpm). */
  avg_hr: number;
  /** Zone of the observed average HR. */
  zone: ZoneKey;
  /** Maximum expected zone for the type. */
  expected_zone: ZoneKey;
  /** Average cardiac drift (%), if available. */
  avg_drift_pct: number | null;
  /** Average beats above the upper limit of the expected zone (0 if inside). */
  over_bpm: number;
  /** true = HR exceeds the expected zone by more than the tolerance: that pace is too much for now. */
  too_hard: boolean;
}

interface CalibrationRun {
  type: ActivityType;
  sport?: string | null;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  hr_drift_pct?: number | null;
}

/**
 * Aggregates recent runs by type and checks whether the average HR is in the
 * expected zone. Returns only the types with at least one run that has pace + HR.
 * Needs the profile with max_hr, otherwise null (zones can't be computed).
 */
export function calibratePaces(
  runs: CalibrationRun[],
  profile: HrConfig,
): PaceCalibrationEntry[] | null {
  if (profile.max_hr == null) return null;

  const byType = new Map<
    WorkoutType,
    { pace: number; hr: number; n: number; drift: number; nDrift: number }
  >();
  for (const r of runs) {
    if ((r.sport ?? "running") !== "running") continue;
    if (r.avg_pace_s_km == null || r.avg_hr == null) continue;
    // A run imported without classification can't feed the
    // specific easy/tempo/long calibration until it is interpreted.
    if (r.type === "unclassified") continue;
    const expected = EXPECTED_MAX_ZONE[r.type];
    if (!expected) continue;
    const e = byType.get(r.type) ?? { pace: 0, hr: 0, n: 0, drift: 0, nDrift: 0 };
    e.pace += r.avg_pace_s_km;
    e.hr += r.avg_hr;
    e.n += 1;
    if (r.hr_drift_pct != null) {
      e.drift += r.hr_drift_pct;
      e.nDrift += 1;
    }
    byType.set(r.type, e);
  }

  const zones = hrZones(profile);
  const out: PaceCalibrationEntry[] = [];
  for (const [type, e] of byType) {
    const avg_hr = Math.round(e.hr / e.n);
    const zone = zoneForHr(avg_hr, profile);
    if (!zone) continue;
    const expected_zone = EXPECTED_MAX_ZONE[type]!;
    const next = NEXT_ZONE[expected_zone];
    // Upper limit of the expected zone = next zone threshold - 1.
    const limit = zones && next ? zones.lower[next] - 1 : null;
    const over_bpm = limit == null ? 0 : Math.max(0, avg_hr - limit);
    out.push({
      type,
      runs: e.n,
      avg_pace_s_km: Math.round(e.pace / e.n),
      avg_hr,
      zone,
      expected_zone,
      avg_drift_pct:
        e.nDrift > 0 ? Math.round((e.drift / e.nDrift) * 10) / 10 : null,
      over_bpm,
      too_hard: limit == null
        ? ZONE_INDEX[zone] > ZONE_INDEX[expected_zone]
        : over_bpm > HR_TOLERANCE_BPM,
    });
  }

  return out.length > 0 ? out : null;
}
