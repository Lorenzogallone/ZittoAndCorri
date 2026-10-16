// Previsione dei tempi gara dai best effort recenti (formula di Riegel).
// Funzioni pure.

import { EFFORTS, type BestEfforts } from "./best-efforts.ts";
import { riegel } from "./predict.ts";

export interface PredictionReference {
  meters: number;
  time_s: number;
  activity_id: string;
}

export interface RacePrediction {
  label: string;
  meters: number;
  time_s: number;
}

/** Distanze mostrate nelle previsioni. */
export const PREDICTION_DISTANCES = [
  { label: "5 km", meters: 5_000 },
  { label: "10 km", meters: 10_000 },
  { label: "Mezza", meters: 21_097 },
  { label: "Maratona", meters: 42_195 },
] as const;

/** Distanza minima di un best effort per fare da riferimento affidabile. */
const MIN_REFERENCE_M = 5_000;

/**
 * Il riferimento è la prestazione con il miglior "10 km equivalente" tra i
 * best effort ≥ 5 km. Senza best effort ripiega sulle corse intere ≥ 3 km.
 */
export function predictionReference(
  activities: Array<{
    id: string;
    sport: string;
    distance_m: number;
    active_s: number;
    best_efforts: BestEfforts | null;
  }>,
): PredictionReference | null {
  let best: PredictionReference | null = null;
  let bestEquivalent = Number.POSITIVE_INFINITY;
  const consider = (meters: number, time: number, id: string) => {
    if (meters <= 0 || time <= 0) return;
    const equivalent = time * (10_000 / meters) ** 1.06;
    if (equivalent < bestEquivalent) {
      bestEquivalent = equivalent;
      best = { meters, time_s: time, activity_id: id };
    }
  };
  for (const activity of activities) {
    if (activity.sport !== "running") continue;
    for (const effort of EFFORTS) {
      const time = activity.best_efforts?.[effort.key];
      if (effort.meters >= MIN_REFERENCE_M && time != null) consider(effort.meters, time, activity.id);
    }
  }
  if (best) return best;
  for (const activity of activities) {
    if (activity.sport === "running" && activity.distance_m >= 3_000) {
      consider(activity.distance_m, activity.active_s, activity.id);
    }
  }
  return best;
}

export function predictRaceTimes(reference: PredictionReference): RacePrediction[] {
  return PREDICTION_DISTANCES.map((distance) => ({
    label: distance.label,
    meters: distance.meters,
    time_s: riegel(reference.meters, reference.time_s, distance.meters),
  }));
}

export function predictTime(reference: PredictionReference, meters: number): number {
  return riegel(reference.meters, reference.time_s, meters);
}
