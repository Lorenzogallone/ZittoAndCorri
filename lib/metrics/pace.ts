// Funzione pura: passo medio. PLAN.md §7.
// L'LLM non produce mai questo numero — è ricostruibile dalle corse.

/**
 * Passo medio in secondi per km.
 * @param distance_m distanza in metri (> 0)
 * @param duration_s durata totale in secondi (> 0)
 * @returns secondi/km arrotondato all'intero
 */
export function avgPace(distance_m: number, duration_s: number): number {
  if (distance_m <= 0 || duration_s <= 0) {
    throw new Error("avgPace: distance_m e duration_s devono essere positivi");
  }
  return Math.round(duration_s / (distance_m / 1000));
}
