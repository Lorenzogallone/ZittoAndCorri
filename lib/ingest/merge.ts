// Merge of two ActivityInputs of the same activity (e.g. GPX + FIT from Zepp).
// The FIT is normally the "rich" file (cadence, calories, moving time); the GPX
// fills the gaps and carries the track name. Pure function: no DB.

import type { ActivityInput } from "@/lib/ingest/schema";

/** Maximum distance between starts for the files to count as the same activity. */
export const SAME_ACTIVITY_WINDOW_MIN = 30;

/** Series with more samples (on a tie, the first). */
function pickLonger<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a || a.length === 0) return b && b.length > 0 ? b : undefined;
  if (!b || b.length === 0) return a;
  return b.length > a.length ? b : a;
}

/** Minutes (absolute) between the starts of two inputs. */
export function startDiffMinutes(a: ActivityInput, b: ActivityInput): number {
  return (
    Math.abs(
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    ) / 60_000
  );
}

/**
 * Merges `other` into `rich` (the more complete file, normally the FIT).
 * Fields of `rich` win; `other` fills the missing ones. Exceptions:
 * - notes: the GPX track name is more descriptive than the FIT sport label;
 * - HR/GPS series: the denser one wins (some GPX sample more often).
 * Throws if the starts are more than SAME_ACTIVITY_WINDOW_MIN minutes apart.
 */
export function mergeActivityInputs(
  rich: ActivityInput,
  other: ActivityInput,
): ActivityInput {
  const diffMin = startDiffMinutes(rich, other);
  if (diffMin > SAME_ACTIVITY_WINDOW_MIN) {
    throw new Error(
      `I due file sembrano attività diverse (inizio a ~${Math.round(diffMin)} minuti di distanza).`,
    );
  }

  return {
    ...rich,
    distance_m: rich.distance_m > 0 ? rich.distance_m : other.distance_m,
    moving_time_s: rich.moving_time_s ?? other.moving_time_s,
    avg_hr: rich.avg_hr ?? other.avg_hr,
    max_hr: rich.max_hr ?? other.max_hr,
    elevation_gain_m: rich.elevation_gain_m ?? other.elevation_gain_m,
    calories: rich.calories ?? other.calories,
    rpe: rich.rpe ?? other.rpe,
    rpe_source: rich.rpe_source ?? other.rpe_source,
    source_title: other.source_title ?? rich.source_title,
    notes: rich.notes ?? other.notes,
    hr_series: pickLonger(rich.hr_series, other.hr_series),
    gps_series: pickLonger(rich.gps_series, other.gps_series),
    cadence_series: rich.cadence_series ?? other.cadence_series,
  };
}
