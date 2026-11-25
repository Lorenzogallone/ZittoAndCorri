// Enrichment of an already saved run (second file, Intervals.icu after the
// GPX…): decides whether the data changed enough to redo the analysis and whether
// the athlete should be notified. Pure functions.

/** What the run analysis reads, before or after enrichment. */
export interface EnrichmentSnapshot {
  hasHr: boolean;
  hasGps: boolean;
  hasDistance: boolean;
  hasLaps: boolean;
  moving_time_s: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  /** Athlete note (e.g. ?notes= on the second file): the analysis reads it. */
  notes: string | null;
}

/** Below this change the moving time (and so the pace) is the same. */
const MOVING_TIME_MIN_DELTA_S = 30;
const MOVING_TIME_MIN_DELTA_RATIO = 0.02;

/**
 * Substantial change: streams that were missing now arrive (HR, GPS,
 * distance or laps for intervals), HR, elevation, RPE or note previously empty, or a really
 * different moving time (pace). Cadence alone, slightly denser series or
 * the same file re-imported do not count.
 */
export function enrichmentIsSubstantial(before: EnrichmentSnapshot, after: EnrichmentSnapshot): boolean {
  const gained = (key: "hasHr" | "hasGps" | "hasDistance" | "hasLaps") => !before[key] && after[key];
  if (gained("hasHr") || gained("hasGps") || gained("hasDistance") || gained("hasLaps")) return true;
  const filled = (key: "avg_hr" | "max_hr" | "elevation_gain_m" | "rpe") => before[key] == null && after[key] != null;
  if (filled("avg_hr") || filled("max_hr") || filled("elevation_gain_m") || filled("rpe")) return true;
  if (!before.notes?.trim() && after.notes?.trim()) return true;
  const a = before.moving_time_s;
  const b = after.moving_time_s;
  if (a == null || b == null) return a !== b;
  const delta = Math.abs(a - b);
  return delta >= MOVING_TIME_MIN_DELTA_S && delta >= a * MOVING_TIME_MIN_DELTA_RATIO;
}

/** Ingest outcome: new or enriched run, and whether the data changed. */
export interface IngestOutcome {
  id: string;
  created: boolean;
  /** Only for enrichments; a new run is always to be analysed. */
  substantial: boolean;
}

/**
 * Analysis after an ingest:
 * - new run, or enriched but never analysed → analysis with notification;
 * - enriched with analysis already done and data changed → analysis without notification;
 * - otherwise nothing (no second analysis nor second push).
 */
export function evaluationAfterIngest(
  outcome: Pick<IngestOutcome, "created" | "substantial">,
  hasEvaluation: boolean,
): "notify" | "silent" | "skip" {
  if (outcome.created || !hasEvaluation) return "notify";
  return outcome.substantial ? "silent" : "skip";
}
