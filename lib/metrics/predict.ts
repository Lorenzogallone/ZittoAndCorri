// Funzioni pure: previsione gara. PLAN.md §7.
//
// Base: formula di Riegel T2 = T1 · (D2/D1)^k (Riegel 1981, come riportata da
// Vickers & Vertosick). Il k = 1,06 è quello dei calcolatori più diffusi;
// secondo Vickers & Vertosick, Riegel indica 1,05–1,06 per amatori maschi di
// 40-70 anni e 1,08 per gli élite.
//
// Vickers & Vertosick 2016, "An empirical study of race times in recreational
// endurance runners", BMC Sports Sci Med Rehabil, doi:10.1186/s13102-016-0052-y
// (N = 2303 amatori): con k = 1,07 Riegel è ben calibrato fino alla mezza ma
// sottostima la maratona; la loro correzione con il chilometraggio settimanale
// è costruita per la maratona. Il campione correva in mediana 30 miglia
// (~48 km) a settimana. Lo studio non dice nulla sul volume basso nella mezza:
// applicare una penalità di volume anche lì è una nostra ASSUNZIONE, motivata
// dal fatto che chi corre molto meno della mediana è fuori dalla popolazione
// su cui 1,07 è stato calibrato.
//
// Da qui la forbice:
// - ottimistica: k = 1,06, Riegel classico (resistenza "da allenato");
// - centrale: k = 1,07 (la media di Vickers) più una penalità di resistenza
//   quando volume e lungo sono sotto quelli del campione su cui 1,07 è stato
//   misurato;
// - prudente: la centrale più un margine che cresce con la stessa penalità.
// Quando il riferimento è vecchio la forbice si allarga in entrambi i versi.
// Le costanti senza fonte diretta sono marcate ASSUNZIONE con il motivo.

import type { RacePredict } from "@/lib/types";

/** Esponente di Riegel classico (Riegel 1981): estremo ottimistico. */
export const RIEGEL_K = 1.06;
/** Esponente medio per amatori, calibrato fino alla mezza (Vickers & Vertosick 2016). */
export const RECREATIONAL_K = 1.07;
/**
 * Volume settimanale (km) del campione di Vickers & Vertosick (mediana 30 mi).
 * Sotto questo volume l'atleta è fuori dalla popolazione su cui k = 1,07 è calibrato.
 */
export const REFERENCE_WEEKLY_KM = 48;
/**
 * ASSUNZIONE: penalità massima sull'esponente con base di resistenza nulla
 * (k fino a 1,12). Nessuna fonte dà questo valore: è scelto perché con
 * volume e lungo a metà del necessario la mezza stimata da un 5 km esca di
 * circa il 5% più lenta di Riegel classico, un calo plausibile per chi non ha
 * mai coperto la distanza in allenamento.
 */
export const MAX_ENDURANCE_K_PENALTY = 0.05;
/**
 * ASSUNZIONE: incertezza minima verso il prudente, pari al passo 1,07 → 1,08
 * usato da Vickers & Vertosick nell'analisi di sensibilità.
 */
export const BASE_K_SPREAD = 0.01;
/** ASSUNZIONE: margine prudente aggiuntivo con base di resistenza nulla (incertezza, non solo media). */
export const MAX_EXTRA_K_SPREAD = 0.03;
/**
 * ASSUNZIONE: la forma di un amatore cambia di circa l'1% al mese. Un
 * riferimento più vecchio di due settimane allarga la forbice di tanto.
 */
export const AGE_WIDEN_PER_30D = 0.01;
export const AGE_GRACE_DAYS = 14;
export const MAX_AGE_WIDEN = 0.04;
/**
 * ASSUNZIONE (prassi di allenamento): un lungo pari alla distanza di gara
 * copre la mezza; per la maratona i lunghi raramente superano i 30 km.
 */
export const LONG_RUN_CAP_M = 30_000;

/** Riegel con esponente esplicito. */
export function riegelK(d1_m: number, t1_s: number, d2_m: number, k: number): number {
  if (d1_m <= 0 || t1_s <= 0 || d2_m <= 0) {
    throw new Error("riegel: distanza e tempo devono essere positivi");
  }
  return t1_s * (d2_m / d1_m) ** k;
}

/**
 * Predizione Riegel: T1/D1 è la prestazione di riferimento (in secondi e metri),
 * D2 è la distanza target (in metri).
 */
export function riegel(d1_m: number, t1_s: number, d2_m: number): number {
  return Math.round(riegelK(d1_m, t1_s, d2_m, RIEGEL_K));
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

// ── Forbice ─────────────────────────────────────────────────────────────────

export interface EnduranceBase {
  /** Km medi a settimana nelle ultime 4 settimane (solo corsa). */
  weekly_km: number;
  /** Corsa più lunga delle ultime 8 settimane (m). */
  longest_m: number;
}

export interface RangeInput {
  reference: { meters: number; time_s: number };
  /** Giorni trascorsi dalla prova di riferimento. */
  reference_age_days: number;
  target_m: number;
  base: EnduranceBase;
}

export interface RaceRange {
  target_m: number;
  optimistic_s: number;
  central_s: number;
  prudent_s: number;
  /** Copertura 0–1 del volume settimanale rispetto a quello richiesto. */
  volume_cover: number;
  /** Copertura 0–1 del lungo rispetto alla distanza. */
  long_cover: number;
  /** Allargamento relativo dovuto all'età del riferimento (0–MAX_AGE_WIDEN). */
  age_widen: number;
  k: { optimistic: number; central: number; prudent: number };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round10 = (s: number) => Math.round(s / 10) * 10;

/**
 * Volume settimanale richiesto per la distanza. Per mezza e oltre è il volume
 * del campione Vickers; ASSUNZIONE: sotto la mezza scala con la distanza
 * (un 10 km chiede circa metà della base di una mezza).
 */
export function requiredWeeklyKm(target_m: number): number {
  return REFERENCE_WEEKLY_KM * Math.min(1, target_m / 21_097);
}

/** Copertura di volume e lungo per la distanza target, 0–1 ciascuna. */
export function enduranceCover(base: EnduranceBase, target_m: number): { volume: number; long: number } {
  return {
    volume: clamp01(base.weekly_km / requiredWeeklyKm(target_m)),
    long: clamp01(base.longest_m / Math.min(target_m, LONG_RUN_CAP_M)),
  };
}

/**
 * Forbice ottimistica–centrale–prudente per `target_m`.
 * La penalità di resistenza vale solo se si estrapola verso una distanza più
 * lunga del riferimento: su distanze più corte volume e lungo contano poco.
 */
export function predictRange(input: RangeInput): RaceRange {
  const { reference, target_m, base } = input;
  const cover = enduranceCover(base, target_m);
  const longer = target_m > reference.meters;
  // Prontezza 0–1: media semplice di volume e lungo, pesi uguali (nessuna
  // evidenza per pesarli diversamente).
  const gap = longer ? 1 - (cover.volume + cover.long) / 2 : 0;
  const kCentral = RECREATIONAL_K + gap * MAX_ENDURANCE_K_PENALTY;
  const kPrudent = kCentral + BASE_K_SPREAD + gap * MAX_EXTRA_K_SPREAD;
  const age_widen = Math.min(
    MAX_AGE_WIDEN,
    Math.max(0, input.reference_age_days - AGE_GRACE_DAYS) / 30 * AGE_WIDEN_PER_30D,
  );
  const at = (k: number) => riegelK(reference.meters, reference.time_s, target_m, k);
  // Verso distanze più corte un k più alto dà tempi più bassi: ordina per tempo.
  const [low, mid, high] = [at(RIEGEL_K), at(kCentral), at(kPrudent)].sort((a, b) => a - b);
  return {
    target_m,
    optimistic_s: round10(low * (1 - age_widen)),
    central_s: round10(mid),
    prudent_s: round10(high * (1 + age_widen)),
    volume_cover: cover.volume,
    long_cover: cover.long,
    age_widen,
    k: { optimistic: RIEGEL_K, central: kCentral, prudent: kPrudent },
  };
}

// ── Passo gara consigliato ──────────────────────────────────────────────────

export type GoalFit = "inside" | "too_fast" | "too_slow";

export interface PaceAdvice {
  /** Passo di partenza consigliato (s/km): più veloce e più lento. */
  fast_s_km: number;
  slow_s_km: number;
  /** null senza tempo obiettivo. */
  goal_fit: GoalFit | null;
  goal_pace_s_km: number | null;
  /** L'obiettivo è dentro la forbice ma più veloce della previsione centrale. */
  goal_ambitious: boolean;
}

const round5 = (s: number) => Math.round(s / 5) * 5;

/**
 * Passo di partenza: dalla previsione centrale a metà strada verso la
 * prudente. Partire più piano della media attesa e accelerare nel finale è
 * la prassi consolidata (negative split); con poco volume il rischio è il
 * calo negli ultimi km, non i secondi persi all'inizio. Se l'obiettivo è
 * dentro la forbice e più lento della centrale, il passo obiettivo diventa
 * l'estremo veloce: non serve rischiare di più.
 */
export function racePaceAdvice(range: RaceRange, goal_s: number | null): PaceAdvice {
  const km = range.target_m / 1000;
  const central = range.central_s / km;
  const halfway = (range.central_s + range.prudent_s) / 2 / km;
  const goalPace = goal_s != null && goal_s > 0 ? goal_s / km : null;
  let goal_fit: GoalFit | null = null;
  if (goal_s != null && goal_s > 0) {
    goal_fit = goal_s < range.optimistic_s ? "too_fast" : goal_s > range.prudent_s ? "too_slow" : "inside";
  }
  let fast = central;
  let slow = halfway;
  if (goalPace != null && goal_fit !== "too_fast" && goalPace > central) {
    fast = goalPace;
    slow = Math.max(goalPace, halfway);
  }
  let fast_s_km = round5(fast);
  let slow_s_km = round5(slow);
  if (slow_s_km <= fast_s_km) slow_s_km = fast_s_km + 5;
  if (fast_s_km > slow_s_km) [fast_s_km, slow_s_km] = [slow_s_km, fast_s_km];
  return {
    fast_s_km,
    slow_s_km,
    goal_fit,
    goal_pace_s_km: goalPace == null ? null : Math.round(goalPace),
    goal_ambitious: goal_fit === "inside" && goal_s! < range.central_s,
  };
}
