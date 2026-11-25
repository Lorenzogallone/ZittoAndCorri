// Best efforts over standard distances and personal records.
// Pure functions: the best time over each distance is the fastest window
// of the GPS track that covers at least that distance.

import type { Translator } from "../../i18n/config.ts";
import type { GpsPoint } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";
import { withoutPauses } from "./pauses.ts";

export type EffortKey = "1k" | "5k" | "10k" | "half" | "marathon";

export const EFFORTS: ReadonlyArray<{ key: EffortKey; meters: number }> = [
  { key: "1k", meters: 1_000 },
  { key: "5k", meters: 5_000 },
  { key: "10k", meters: 10_000 },
  { key: "half", meters: 21_097 },
  { key: "marathon", meters: 42_195 },
];

/** Distance name ("5 km", "Mezza"); `t` is bound to the "metrics" namespace. */
export const effortLabel = (key: EffortKey, t: Translator): string => t(`efforts.${key}`);

/** Seconds per standard distance. Empty object = computed, no useful data. */
export type BestEfforts = Partial<Record<EffortKey, number>>;

/** Speed above which a window is surely a GPS error (m/s). */
const MAX_EFFORT_SPEED = 7;

/** Minimum time (s) to cover `meters` along the track, interpolating the start. */
function fastestWindow(times: number[], cum: number[], meters: number): number | null {
  const n = cum.length;
  if (n < 2 || cum[n - 1] < meters) return null;
  let best: number | null = null;
  let i = 0;
  for (let j = 1; j < n; j++) {
    while (i + 1 < j && cum[j] - cum[i + 1] >= meters) i++;
    const covered = cum[j] - cum[i];
    if (covered < meters) continue;
    // Exact point where the `meters`-long window starts.
    const startDistance = cum[j] - meters;
    const segment = cum[i + 1] - cum[i];
    const fraction = segment > 0 ? (startDistance - cum[i]) / segment : 0;
    const startTime = times[i] + (times[i + 1] - times[i]) * Math.min(1, Math.max(0, fraction));
    const elapsed = times[j] - startTime;
    if (elapsed <= 0 || meters / elapsed > MAX_EFFORT_SPEED) continue;
    if (best == null || elapsed < best) best = elapsed;
  }
  return best == null ? null : Math.round(best);
}

/** Best efforts from the GPS track of a run. */
export function bestEffortsFromGps(track: GpsPoint[]): BestEfforts {
  if (!track || track.length < 2) return {};
  const gps = withoutPauses({ gps: track }).gps!;
  const cum = cumulativeDistance(gps);
  const times = gps.map((p) => p.t);
  const out: BestEfforts = {};
  for (const effort of EFFORTS) {
    const seconds = fastestWindow(times, cum, effort.meters);
    if (seconds != null) out[effort.key] = seconds;
  }
  return out;
}

/**
 * Best efforts of an activity. Uses GPS when available; without GPS only a
 * run whose total distance matches a standard distance counts (e.g. a
 * race entered by hand), scaling the time to the exact distance.
 * Null for non-running activities.
 */
export function bestEffortsForActivity(activity: {
  sport: string;
  distance_m: number;
  duration_s: number;
  moving_time_s?: number | null;
  gps?: GpsPoint[] | null;
}): BestEfforts | null {
  if (activity.sport !== "running") return null;
  const fromGps = activity.gps && activity.gps.length >= 2 ? bestEffortsFromGps(activity.gps) : {};
  const active = activity.moving_time_s ?? activity.duration_s;
  for (const effort of EFFORTS) {
    if (fromGps[effort.key] != null || active <= 0) continue;
    const ratio = activity.distance_m / effort.meters;
    if (ratio >= 0.995 && ratio <= 1.04) {
      const scaled = Math.round(active / ratio);
      if (effort.meters / scaled <= MAX_EFFORT_SPEED) fromGps[effort.key] = scaled;
    }
  }
  return fromGps;
}

export interface PersonalRecord {
  key: EffortKey;
  meters: number;
  time_s: number;
  activity_id: string;
  date: string;
}

/** Personal records: for each distance the best time and the activity that holds it. */
export function personalRecords(
  activities: Array<{ id: string; started_at: string; best_efforts: BestEfforts | null }>,
): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const effort of EFFORTS) {
    let best: PersonalRecord | null = null;
    for (const activity of activities) {
      const time = activity.best_efforts?.[effort.key];
      if (time == null || time <= 0) continue;
      if (!best || time < best.time_s || (time === best.time_s && activity.started_at < best.date)) {
        best = {
          key: effort.key,
          meters: effort.meters,
          time_s: time,
          activity_id: activity.id,
          date: activity.started_at,
        };
      }
    }
    if (best) records.push(best);
  }
  return records;
}
