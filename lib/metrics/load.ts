// Funzioni pure: carico di allenamento sRPE (Foster) + EWMA ATL/CTL/TSB. PLAN.md §7.

import type { ATLCTLResult } from "@/lib/types";

/**
 * Carico della sessione — sRPE (Foster): minuti * RPE.
 * PLAN §7: se manca RPE usa 5 come stima neutrale.
 */
export function sessionLoad(
  duration_s: number,
  rpe: number | null | undefined,
): number {
  const effectiveRpe = rpe ?? 5;
  return Math.round((duration_s / 60) * effectiveRpe);
}

/**
 * Fattore EWMA per una finestra di N giorni: α = 2 / (N + 1).
 */
function ewmaAlpha(days: number): number {
  return 2 / (days + 1);
}

/**
 * Calcola ATL (7gg), CTL (42gg) e TSB = CTL - ATL con EWMA sul carico giornaliero.
 * Input: array di { date: 'YYYY-MM-DD', load } già ordinato per data (più vecchio prima).
 * I giorni senza attività valgono load 0 (vengono riempiti internamente).
 * Ritorna l'evoluzione completa + i valori correnti.
 */
export function computeATLCTL(
  activities: Array<{ started_at: string; duration_s: number; rpe: number | null }>,
  asOfDate: string = new Date().toISOString().slice(0, 10),
): ATLCTLResult {
  if (activities.length === 0) {
    return { atl: 0, ctl: 0, tsb: 0, series: [] };
  }

  // 1. Calcola il carico per data
  const loadByDate = new Map<string, number>();
  for (const a of activities) {
    const date = a.started_at.slice(0, 10); // YYYY-MM-DD
    const load = sessionLoad(a.duration_s, a.rpe);
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
  }

  // 2. Genera la sequenza di date dall'attività più vecchia a oggi
  const sorted = [...loadByDate.keys()].sort();
  const startDate = sorted[0];

  const days: Array<{ date: string; load: number }> = [];
  let cursor = new Date(startDate);
  const end = new Date(`${asOfDate}T00:00:00Z`);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    days.push({ date: d, load: loadByDate.get(d) ?? 0 });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  // 3. EWMA
  const aATL = ewmaAlpha(7);
  const aCTL = ewmaAlpha(42);
  let atl = 0;
  let ctl = 0;

  const series: ATLCTLResult["series"] = [];
  for (const { date, load } of days) {
    atl = load * aATL + atl * (1 - aATL);
    ctl = load * aCTL + ctl * (1 - aCTL);
    const tsb = ctl - atl;
    series.push({ date, atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb) });
  }

  const last = series[series.length - 1];
  return { atl: last.atl, ctl: last.ctl, tsb: last.tsb, series };
}

/** TSB (freshness) = CTL - ATL. Positivo = fresco, negativo = affaticato. */
export function tsb(ctl: number, atl: number): number {
  return Math.round(ctl - atl);
}
