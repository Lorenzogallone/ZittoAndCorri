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

// ── Più dati: soglia e tenuta ───────────────────────────────────────────────
//
// Una prova sola (di solito 5 km) va estrapolata di oltre 4 volte per arrivare
// alla mezza. Le sedute di soglia danno una seconda stima più vicina alla
// distanza: il passo di soglia è per definizione quello che si regge circa
// un'ora in gara (Daniels, "Daniels' Running Formula": passo T ≈ passo di una
// gara di 60 minuti). I tratti sostenuti diventano quindi una "prova di 60
// minuti" e passano dalla stessa formula della prova vera.

/** Durata della gara equivalente al passo di soglia (Daniels: circa 60 minuti). */
export const THRESHOLD_RACE_S = 3600;
/**
 * ASSUNZIONE: le sedute di soglia non sono una gara. Il passo dei tratti con
 * recupero in mezzo è un po' più facile di 60 minuti continui, ma spesso si
 * corrono sotto la soglia vera: i due effetti si compensano, però il dato vale
 * meno di una prova massimale. Da qui il peso di partenza più basso.
 */
export const THRESHOLD_BASE_WEIGHT = 0.8;
/**
 * ASSUNZIONE: quanto il passo dei tratti di soglia può scostarsi dal vero passo
 * di una gara di 60 minuti, in più o in meno (recuperi in mezzo, giornata,
 * sedute corse sotto soglia). Il 2,5% è circa 8 s/km a 5:20/km: l'ordine di
 * grandezza della differenza tra una seduta controllata e una tirata.
 */
export const THRESHOLD_UNCERTAINTY = 0.025;
/**
 * Due stime indipendenti con incertezza simile, se concordano, dimezzano la
 * varianza: l'errore scende di 1/√2, cioè la forbice si stringe del 29%.
 * Vale per l'incertezza sulla forma; quella sulla tenuta oltre il lungo più
 * lungo non cambia, perché nessuna delle due stime la misura.
 */
export const AGREEMENT_SHRINK = 1 - Math.SQRT1_2;
/** ASSUNZIONE: oltre il 4% di distanza tra le stime non c'è accordo e la forbice non si stringe. */
export const AGREEMENT_SPAN = 0.04;
/**
 * ASSUNZIONE (prassi di allenamento): una deriva cardiaca sotto il 5% in un
 * lungo indica buona tenuta aerobica, sopra il 10% scarsa. La tenuta sposta la
 * penalità di resistenza al massimo del 25% in un verso o nell'altro: misura
 * il cuore a passo facile, non a passo gara, quindi conta ma non decide.
 */
export const DRIFT_GOOD_PCT = 3;
export const DRIFT_POOR_PCT = 10;
export const MAX_DURABILITY_SHIFT = 0.25;

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
  /** Passo sostenuto nelle sedute di soglia recenti: una seconda stima, indipendente dalla prova. */
  threshold?: ThresholdEvidence | null;
  /** Tenuta nei lunghi: quanto sale il cuore a passo costante. */
  durability?: DurabilityEvidence | null;
}

export interface ThresholdEvidence {
  /** Passo medio dei tratti sostenuti, pesato per durata e recenza (s/km). */
  pace_s_km: number;
  sessions: number;
  /** Giorni dalla seduta più recente. */
  age_days: number;
  /** Date (ISO) delle sedute usate, dalla più recente. */
  dates: string[];
}

export interface DurabilityEvidence {
  /** Deriva cardiaca mediana (%) nei lunghi recenti. */
  drift_pct: number;
  runs: number;
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
  /** Stime combinate, se più di una: cosa direbbe ciascuna da sola e quanto pesa. */
  sources?: RangeSource[];
  /** Accordo 0–1 tra le stime (1 = identiche): più concordano, più la forbice si stringe. */
  agreement?: number;
  /** Fattore applicato alla penalità di resistenza per la tenuta nei lunghi (1 = nessuno). */
  durability_factor?: number;
}

export interface RangeSource {
  kind: "effort" | "threshold";
  central_s: number;
  /** Peso 0–1 nella stima combinata (la somma fa 1). */
  weight: number;
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

/** Fattore sulla penalità di resistenza dalla tenuta nei lunghi: 0,75 (ottima) – 1,25 (scarsa). */
export function durabilityFactor(durability: DurabilityEvidence | null | undefined): number {
  if (!durability || durability.runs < 1) return 1;
  const position = clamp01((durability.drift_pct - DRIFT_GOOD_PCT) / (DRIFT_POOR_PCT - DRIFT_GOOD_PCT));
  return 1 - MAX_DURABILITY_SHIFT + position * 2 * MAX_DURABILITY_SHIFT;
}

/** Forbice da una sola prova (vera o equivalente), senza arrotondare. */
function singleRange(reference: { meters: number; time_s: number }, age_days: number, target_m: number, base: EnduranceBase) {
  const cover = enduranceCover(base, target_m);
  const longer = target_m > reference.meters;
  // Prontezza 0–1: media semplice di volume e lungo, pesi uguali (nessuna
  // evidenza per pesarli diversamente), corretta dalla tenuta nei lunghi.
  const durability = longer ? durabilityFactor(base.durability) : 1;
  const gap = longer ? clamp01((1 - (cover.volume + cover.long) / 2) * durability) : 0;
  const kCentral = RECREATIONAL_K + gap * MAX_ENDURANCE_K_PENALTY;
  const kPrudent = kCentral + BASE_K_SPREAD + gap * MAX_EXTRA_K_SPREAD;
  const age_widen = Math.min(MAX_AGE_WIDEN, Math.max(0, age_days - AGE_GRACE_DAYS) / 30 * AGE_WIDEN_PER_30D);
  const at = (k: number) => riegelK(reference.meters, reference.time_s, target_m, k);
  // Verso distanze più corte un k più alto dà tempi più bassi: ordina per tempo.
  const [low, mid, high] = [at(RIEGEL_K), at(kCentral), at(kPrudent)].sort((x, y) => x - y);
  // Quota del margine prudente dovuta alla resistenza mai dimostrata (non alla
  // forma): un'altra stima della forma non la riduce.
  const enduranceMargin = longer ? Math.max(0, at(kPrudent) - at(kCentral + BASE_K_SPREAD)) : 0;
  return {
    optimistic: low * (1 - age_widen),
    central: mid,
    prudent: high * (1 + age_widen),
    enduranceMargin,
    cover,
    age_widen,
    durability,
    k: { optimistic: RIEGEL_K, central: kCentral, prudent: kPrudent },
  };
}

/**
 * Peso di una stima: cala quanto più si estrapola (in scala logaritmica, come
 * la formula) e quando il dato invecchia.
 */
function sourceWeight(reference_m: number, target_m: number, age_days: number, baseWeight: number): number {
  const stretch = Math.abs(Math.log(target_m / reference_m));
  const fresh = Math.max(0.4, 1 - Math.max(0, age_days - AGE_GRACE_DAYS) / 90);
  return (baseWeight / (1 + stretch)) * fresh;
}

/**
 * Forbice ottimistica–centrale–prudente per `target_m`.
 * La penalità di resistenza vale solo se si estrapola verso una distanza più
 * lunga del riferimento: su distanze più corte volume e lungo contano poco.
 * Con le sedute di soglia la stima è la media pesata (sui logaritmi dei
 * tempi) di due stime indipendenti: se concordano la forbice si stringe, se
 * divergono si allarga fino a contenerle entrambe.
 */
export function predictRange(input: RangeInput): RaceRange {
  const { reference, target_m, base } = input;
  const effort = singleRange(reference, input.reference_age_days, target_m, base);
  const result = (optimistic: number, central: number, prudent: number, extra: Partial<RaceRange> = {}): RaceRange => ({
    target_m,
    optimistic_s: round10(optimistic),
    central_s: round10(central),
    prudent_s: round10(prudent),
    volume_cover: effort.cover.volume,
    long_cover: effort.cover.long,
    age_widen: effort.age_widen,
    k: effort.k,
    durability_factor: effort.durability,
    ...extra,
  });
  const threshold = base.threshold;
  if (!threshold || threshold.pace_s_km <= 0 || threshold.sessions < 1) {
    return result(effort.optimistic, effort.central, effort.prudent);
  }

  // Le sedute di soglia come prova di 60 minuti al passo di soglia.
  const equivalent = { meters: (THRESHOLD_RACE_S / threshold.pace_s_km) * 1000, time_s: THRESHOLD_RACE_S };
  const paceRange = singleRange(equivalent, threshold.age_days, target_m, base);
  // Non è una prova massimale: la sua forbice parte già più larga.
  const pace = {
    ...paceRange,
    optimistic: paceRange.optimistic * (1 - THRESHOLD_UNCERTAINTY),
    prudent: paceRange.prudent * (1 + THRESHOLD_UNCERTAINTY),
  };
  const wEffort = sourceWeight(reference.meters, target_m, input.reference_age_days, 1);
  const wPace = sourceWeight(equivalent.meters, target_m, threshold.age_days, THRESHOLD_BASE_WEIGHT);
  const share = wEffort / (wEffort + wPace);
  const blend = (a: number, b: number) => Math.exp(share * Math.log(a) + (1 - share) * Math.log(b));
  const central = blend(effort.central, pace.central);
  let optimistic = blend(effort.optimistic, pace.optimistic);
  let prudent = blend(effort.prudent, pace.prudent);
  const distance = Math.abs(Math.log(effort.central / pace.central));
  const agreement = clamp01(1 - distance / AGREEMENT_SPAN);
  const shrink = 1 - AGREEMENT_SHRINK * agreement;
  optimistic = central - (central - optimistic) * shrink;
  // Verso il prudente si stringe solo l'incertezza sulla forma: il margine per
  // la distanza mai coperta in allenamento resta intero.
  const endurance = Math.min(prudent - central, blend(effort.enduranceMargin || 1e-9, pace.enduranceMargin || 1e-9));
  prudent = central + (prudent - central - endurance) * shrink + endurance;
  // In disaccordo la forbice deve contenere entrambe le stime centrali.
  optimistic = Math.min(optimistic, effort.central, pace.central);
  prudent = Math.max(prudent, effort.central, pace.central);
  return result(optimistic, central, prudent, {
    agreement,
    sources: [
      { kind: "effort", central_s: round10(effort.central), weight: share },
      { kind: "threshold", central_s: round10(pace.central), weight: 1 - share },
    ],
  });
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
