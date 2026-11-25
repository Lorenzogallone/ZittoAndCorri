// Type of an imported run (which arrives "unclassified"): from the matched plan
// session, if the data confirms it, otherwise from the recognized segments,
// distance and duration. Pure functions.

import { isQualityRun, type RunIntervalsInput } from "./body-trends.ts";
import type { WorkoutType } from "../types.ts";

/** From here up (or beyond LONG_MIN) it is a long run, even without a plan. */
const LONG_M = 10_500;
const LONG_S = 65 * 60;
/** Intervals: at least 3 fast segments, with typical duration under 6 minutes. */
const INTERVAL_MIN_REPS = 3;
const INTERVAL_MAX_S = 6 * 60;

export interface RunTypeInput {
  intervals: RunIntervalsInput | null | undefined;
  /** Type of the matched plan session, if any. */
  planned: WorkoutType | null | undefined;
  distance_m: number | null;
  moving_time_s: number | null;
  duration_s: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Quality session: the plan type if it is quality (intervals, threshold,
 * race), otherwise intervals or threshold from the shape of the segments. Easy run:
 * long if the plan says so or if it is long, recovery if the plan says so,
 * otherwise easy. If the plan asked for quality but the run was easy,
 * the data wins.
 */
export function classifyRun(run: RunTypeInput): WorkoutType {
  const seconds = run.moving_time_s ?? run.duration_s ?? 0;
  if (isQualityRun({ intervals: run.intervals ?? null, moving_time_s: run.moving_time_s, duration_s: run.duration_s })) {
    if (run.planned === "interval" || run.planned === "tempo" || run.planned === "race") return run.planned;
    const work = (run.intervals?.segments ?? [])
      .filter((segment) => segment.kind === "work" && segment.variant !== "sprint" && segment.duration_s >= 30)
      .map((segment) => segment.duration_s);
    return work.length >= INTERVAL_MIN_REPS && median(work) < INTERVAL_MAX_S ? "interval" : "tempo";
  }
  if (run.planned === "long" || (run.distance_m ?? 0) >= LONG_M || seconds >= LONG_S) return "long";
  if (run.planned === "recovery") return "recovery";
  return "easy";
}
