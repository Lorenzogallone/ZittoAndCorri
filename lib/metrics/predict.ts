// Funzioni pure: predizione gara con formula di Riegel. PLAN.md §7.
// T2 = T1 * (D2/D1)^1.06

import type { RacePredict } from "@/lib/types";

/**
 * Predizione Riegel: T1/D1 è la prestazione di riferimento (in secondi e metri),
 * D2 è la distanza target (in metri).
 */
export function riegel(d1_m: number, t1_s: number, d2_m: number): number {
  if (d1_m <= 0 || t1_s <= 0 || d2_m <= 0) {
    throw new Error("riegel: distanza e tempo devono essere positivi");
  }
  return Math.round(t1_s * (d2_m / d1_m) ** 1.06);
}

/**
 * Produce stime Riegel per le distanze canoniche (5k/10k/half) più eventuale
 * distanza target personalizzata. best è la corsa di riferimento.
 */
export function predictRaces(
  best: { distance_m: number; duration_s: number },
  targetDistance_m?: number,
): RacePredict {
  const { distance_m: d1, duration_s: t1 } = best;
  const result: RacePredict = {
    "5k": riegel(d1, t1, 5_000),
    "10k": riegel(d1, t1, 10_000),
    half: riegel(d1, t1, 21_097),
  };
  if (targetDistance_m != null) {
    result.target = riegel(d1, t1, targetDistance_m);
  }
  return result;
}
