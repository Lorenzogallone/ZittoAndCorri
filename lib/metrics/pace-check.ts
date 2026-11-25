// Pace check in sessions with targets (repeats, tempo, progressive).
// For each planned segment it looks in the GPS track for the fastest window of
// the same length (in metres or seconds), without overlaps: so the
// comparison works even if the athlete didn't start the guided session.
// Pure functions.

import type { GpsPoint, WorkoutStepInput } from "@/lib/types";
import { cumulativeDistance } from "./geo.ts";
import { withoutPauses } from "./pauses.ts";

export type PaceStatus = "on_target" | "fast" | "slow";

export interface PaceCheckRep {
  target_min: number | null;
  target_max: number | null;
  pace_s_km: number;
  /** Negative = faster than the range, positive = slower, 0 = inside. */
  deviation_s: number;
}

export interface PaceCheck {
  status: PaceStatus;
  avg_deviation_s: number;
  reps: PaceCheckRep[];
}

/** Average deviation within which the session is considered on target (s/km). */
export const PACE_TOLERANCE_S = 5;

interface Window {
  start: number;
  end: number;
  pace: number;
}

function hasPace(step: WorkoutStepInput): boolean {
  return step.pace_min_s_km != null || step.pace_max_s_km != null;
}

/** Segments to check: the "fast" ones with pace, otherwise the continuous parts with pace. */
export function stepsToCheck(steps: WorkoutStepInput[]): WorkoutStepInput[] {
  const measurable = steps.filter(
    (step) => hasPace(step) && step.completion_type !== "manual" && (step.completion_value ?? 0) > 0,
  );
  const work = measurable.filter((step) => step.kind === "work");
  if (work.length) return work;
  return measurable.filter((step) => step.kind === "steady");
}

/** Free index intervals [from, to] given the list of windows already used. */
function freeRanges(n: number, used: Window[]): Array<[number, number]> {
  const sorted = [...used].sort((a, b) => a.start - b.start);
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  for (const window of sorted) {
    if (window.start - 1 >= cursor) ranges.push([cursor, window.start - 1]);
    cursor = Math.max(cursor, window.end + 1);
  }
  if (cursor <= n - 1) ranges.push([cursor, n - 1]);
  return ranges;
}

function fastestByDistance(times: number[], cum: number[], from: number, to: number, meters: number): Window | null {
  let best: Window | null = null;
  let i = from;
  for (let j = from + 1; j <= to; j++) {
    while (i + 1 < j && cum[j] - cum[i + 1] >= meters) i++;
    const covered = cum[j] - cum[i];
    const elapsed = times[j] - times[i];
    if (covered < meters || elapsed <= 0) continue;
    const pace = (elapsed / covered) * 1000;
    if (!best || pace < best.pace) best = { start: i, end: j, pace };
  }
  return best;
}

function fastestByTime(times: number[], cum: number[], from: number, to: number, seconds: number): Window | null {
  let best: Window | null = null;
  let i = from;
  for (let j = from + 1; j <= to; j++) {
    while (i + 1 < j && times[j] - times[i + 1] >= seconds) i++;
    const elapsed = times[j] - times[i];
    const covered = cum[j] - cum[i];
    if (elapsed < seconds || covered <= 0) continue;
    const pace = (elapsed / covered) * 1000;
    if (!best || pace < best.pace) best = { start: i, end: j, pace };
  }
  return best;
}

function deviation(pace: number, min: number | null, max: number | null): number {
  if (min != null && pace < min) return pace - min;
  if (max != null && pace > max) return pace - max;
  return 0;
}

/**
 * Compares the session's target-pace segments with the GPS track.
 * Null if the track isn't enough or the session has no segments with pace.
 */
export function checkPace(track: GpsPoint[] | null | undefined, steps: WorkoutStepInput[]): PaceCheck | null {
  if (!track || track.length < 10) return null;
  const gps = withoutPauses({ gps: track }).gps!;
  const targets = stepsToCheck(steps);
  if (!targets.length) return null;

  const cum = cumulativeDistance(gps);
  const times = gps.map((point) => point.t);
  const used: Window[] = [];
  const found = new Array<Window | null>(targets.length).fill(null);

  // Longest segments are placed first: the short ones fit in the remaining gaps.
  const order = targets
    .map((step, index) => ({ step, index }))
    .sort((a, b) => (b.step.completion_value ?? 0) - (a.step.completion_value ?? 0));
  for (const { step, index } of order) {
    let best: Window | null = null;
    for (const [from, to] of freeRanges(gps.length, used)) {
      const candidate = step.completion_type === "distance"
        ? fastestByDistance(times, cum, from, to, step.completion_value!)
        : fastestByTime(times, cum, from, to, step.completion_value!);
      if (candidate && (!best || candidate.pace < best.pace)) best = candidate;
    }
    if (!best) return null;
    used.push(best);
    found[index] = best;
  }

  const reps = targets.map((step, index) => {
    const pace = Math.round(found[index]!.pace);
    return {
      target_min: step.pace_min_s_km,
      target_max: step.pace_max_s_km,
      pace_s_km: pace,
      deviation_s: deviation(pace, step.pace_min_s_km, step.pace_max_s_km),
    };
  });
  const avg = Math.round(reps.reduce((sum, rep) => sum + rep.deviation_s, 0) / reps.length);
  const status: PaceStatus = Math.abs(avg) <= PACE_TOLERANCE_S ? "on_target" : avg < 0 ? "fast" : "slow";
  return { status, avg_deviation_s: avg, reps };
}
