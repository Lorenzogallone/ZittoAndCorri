// Merge di due ActivityInput della stessa attività (es. GPX + FIT da Zepp).
// Il FIT è di norma il file "ricco" (cadenza, calorie, moving time); il GPX
// riempie i buchi e porta il nome della traccia. Funzione pura: nessun DB.

import type { ActivityInput } from "@/lib/ingest/schema";

/** Distanza massima tra gli start per considerare i file la stessa attività. */
export const SAME_ACTIVITY_WINDOW_MIN = 30;

/** Serie con più campioni (a parità, la prima). */
function pickLonger<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a || a.length === 0) return b && b.length > 0 ? b : undefined;
  if (!b || b.length === 0) return a;
  return b.length > a.length ? b : a;
}

/** Minuti (assoluti) tra gli start di due input. */
export function startDiffMinutes(a: ActivityInput, b: ActivityInput): number {
  return (
    Math.abs(
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    ) / 60_000
  );
}

/**
 * Fonde `other` dentro `rich` (il file più completo, di norma il FIT).
 * I campi di `rich` vincono; `other` riempie i mancanti. Eccezioni:
 * - notes: il nome traccia del GPX è più descrittivo dell'etichetta sport FIT;
 * - serie HR/GPS: vince la più fitta (alcuni GPX campionano più spesso).
 * Lancia se gli start distano più di SAME_ACTIVITY_WINDOW_MIN minuti.
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
    notes: other.notes ?? rich.notes,
    hr_series: pickLonger(rich.hr_series, other.hr_series),
    gps_series: pickLonger(rich.gps_series, other.gps_series),
    cadence_series: rich.cadence_series ?? other.cadence_series,
  };
}
