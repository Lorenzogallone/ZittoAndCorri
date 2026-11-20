// Tipo di una corsa importata (che arriva "unclassified"): dalla seduta del
// piano abbinata, se i dati la confermano, altrimenti dai tratti riconosciuti,
// dalla distanza e dalla durata. Funzioni pure.

import { isQualityRun, type RunIntervalsInput } from "./body-trends.ts";
import type { WorkoutType } from "../types.ts";

/** Da qui in su (o oltre LONG_MIN) è un lungo, anche senza piano. */
const LONG_M = 10_500;
const LONG_S = 65 * 60;
/** Ripetute: almeno 3 tratti veloci, con durata tipica sotto i 6 minuti. */
const INTERVAL_MIN_REPS = 3;
const INTERVAL_MAX_S = 6 * 60;

export interface RunTypeInput {
  intervals: RunIntervalsInput | null | undefined;
  /** Tipo della seduta del piano abbinata, se c'è. */
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
 * Seduta di qualità: il tipo del piano se è di qualità (ripetute, soglia,
 * gara), altrimenti ripetute o soglia dalla forma dei tratti. Corsa facile:
 * lungo se lo dice il piano o se è lunga, recupero se lo dice il piano,
 * altrimenti facile. Se il piano chiedeva qualità ma la corsa è stata facile,
 * vincono i dati.
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
