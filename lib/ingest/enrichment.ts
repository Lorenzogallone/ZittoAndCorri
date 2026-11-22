// Arricchimento di una corsa già salvata (secondo file, Intervals.icu dopo il
// GPX…): decide se i dati sono cambiati abbastanza da rifare l'analisi e se
// l'atleta va avvisato. Funzioni pure.

/** Cosa legge l'analisi della corsa, prima o dopo l'arricchimento. */
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
  /** Nota dell'atleta (es. ?notes= sul secondo file): l'analisi la legge. */
  notes: string | null;
}

/** Sotto questa variazione il tempo in movimento (e quindi il passo) è lo stesso. */
const MOVING_TIME_MIN_DELTA_S = 30;
const MOVING_TIME_MIN_DELTA_RATIO = 0.02;

/**
 * Cambiamento sostanziale: arrivano stream che prima mancavano (FC, GPS,
 * distanza o lap per le ripetute), FC, dislivello, RPE o nota prima vuoti, o un tempo in
 * movimento (passo) diverso davvero. La sola cadenza, serie un po' più fitte o
 * lo stesso file reimportato non lo sono.
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

/** Esito dell'ingest: corsa nuova o arricchita, e se i dati sono cambiati. */
export interface IngestOutcome {
  id: string;
  created: boolean;
  /** Solo per gli arricchimenti; una corsa nuova è sempre da analizzare. */
  substantial: boolean;
}

/**
 * Analisi dopo un ingest:
 * - corsa nuova, o arricchita ma mai analizzata → analisi con notifica;
 * - arricchita con analisi già fatta e dati cambiati → analisi senza notifica;
 * - altrimenti niente (nessuna seconda analisi né seconda push).
 */
export function evaluationAfterIngest(
  outcome: Pick<IngestOutcome, "created" | "substantial">,
  hasEvaluation: boolean,
): "notify" | "silent" | "skip" {
  if (outcome.created || !hasEvaluation) return "notify";
  return outcome.substantial ? "silent" : "skip";
}
