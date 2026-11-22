// Previsione dei tempi gara dai best effort recenti: forbice attorno a Riegel
// (vedi predict.ts per formule e fonti). Funzioni pure.

import { EFFORTS, type BestEfforts } from "./best-efforts.ts";
import {
  predictRange,
  racePaceAdvice,
  type DurabilityEvidence,
  type EnduranceBase,
  type PaceAdvice,
  type RaceRange,
  type ThresholdEvidence,
} from "./predict.ts";
import { daysBetween, romeDay } from "../local-date.ts";
import { formatDuration, formatPace } from "../format.ts";

export interface PredictionReference {
  meters: number;
  time_s: number;
  activity_id: string;
  /** Inizio della corsa che contiene la prova (ISO). */
  started_at: string;
}

export interface RacePrediction {
  label: string;
  meters: number;
  range: RaceRange;
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
    started_at: string;
    distance_m: number;
    active_s: number;
    best_efforts: BestEfforts | null;
  }>,
): PredictionReference | null {
  let best: PredictionReference | null = null;
  let bestEquivalent = Number.POSITIVE_INFINITY;
  const consider = (meters: number, time: number, id: string, started_at: string) => {
    if (meters <= 0 || time <= 0) return;
    const equivalent = time * (10_000 / meters) ** 1.06;
    if (equivalent < bestEquivalent) {
      bestEquivalent = equivalent;
      best = { meters, time_s: time, activity_id: id, started_at };
    }
  };
  for (const activity of activities) {
    if (activity.sport !== "running") continue;
    for (const effort of EFFORTS) {
      const time = activity.best_efforts?.[effort.key];
      if (effort.meters >= MIN_REFERENCE_M && time != null) consider(effort.meters, time, activity.id, activity.started_at);
    }
  }
  if (best) return best;
  for (const activity of activities) {
    if (activity.sport === "running" && activity.distance_m >= 3_000) {
      consider(activity.distance_m, activity.active_s, activity.id, activity.started_at);
    }
  }
  return best;
}

/** Finestre della base di resistenza: volume su 4 settimane, lungo su 8. */
const VOLUME_DAYS = 28;
const LONG_RUN_DAYS = 56;

/** Sedute di soglia degli ultimi 42 giorni: più vecchie non descrivono la forma di oggi. */
const THRESHOLD_DAYS = 42;
/** Un tratto «di soglia» dura da 6 a 30 minuti: più corto è una ripetuta, più lungo è già una gara. */
const THRESHOLD_MIN_S = 360;
const THRESHOLD_MAX_S = 1800;
/** Servono almeno 15 minuti di lavoro perché la seduta dica qualcosa. */
const THRESHOLD_MIN_WORK_S = 900;
/** Le sedute recenti pesano di più: il peso si dimezza circa ogni due settimane. */
const THRESHOLD_DECAY_DAYS = 21;
/** Lunghi da almeno 70 minuti: sotto, la deriva cardiaca dice poco sulla tenuta. */
const DURABILITY_MIN_S = 70 * 60;

/** Quanto serve di una corsa per la base di resistenza; i campi facoltativi aggiungono soglia e tenuta. */
export interface EnduranceActivity {
  sport: string;
  started_at: string;
  distance_m: number;
  moving_time_s?: number | null;
  duration_s?: number | null;
  hr_drift_pct?: number | null;
  intervals?: {
    source?: string;
    segments?: Array<{ kind: string; variant?: string | null; duration_s: number; distance_m?: number | null; pace_s_km?: number | null }>;
  } | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Passo sostenuto nelle sedute di soglia recenti (tratti da 6 a 30 minuti, almeno 15 in tutto). */
export function thresholdEvidence(activities: EnduranceActivity[], today: string): ThresholdEvidence | null {
  let weighted = 0;
  let weights = 0;
  const dates: Array<{ date: string; age: number }> = [];
  for (const activity of activities) {
    if (activity.sport !== "running" || !activity.intervals || activity.intervals.source === "none") continue;
    const date = romeDay(activity.started_at);
    const age = daysBetween(date, today);
    if (age < 0 || age >= THRESHOLD_DAYS) continue;
    const work = (activity.intervals.segments ?? []).filter(
      (segment) =>
        segment.kind === "work" && segment.variant !== "sprint" &&
        segment.duration_s >= THRESHOLD_MIN_S && segment.duration_s <= THRESHOLD_MAX_S &&
        (segment.pace_s_km ?? 0) > 0,
    );
    const seconds = work.reduce((sum, segment) => sum + segment.duration_s, 0);
    if (seconds < THRESHOLD_MIN_WORK_S) continue;
    // Passo della seduta: tempo totale diviso distanza totale dei tratti.
    const meters = work.reduce((sum, segment) => sum + (segment.distance_m ?? (segment.duration_s / segment.pace_s_km!) * 1000), 0);
    if (meters <= 0) continue;
    const weight = seconds * Math.exp(-age / THRESHOLD_DECAY_DAYS);
    weighted += (seconds / meters) * 1000 * weight;
    weights += weight;
    dates.push({ date, age });
  }
  if (!dates.length || weights <= 0) return null;
  dates.sort((x, y) => x.age - y.age);
  return {
    pace_s_km: Math.round(weighted / weights),
    sessions: dates.length,
    age_days: dates[0].age,
    dates: dates.map((entry) => entry.date),
  };
}

/** Deriva cardiaca mediana nei lunghi (≥ 70 minuti) delle ultime 8 settimane. */
export function durabilityEvidence(activities: EnduranceActivity[], today: string): DurabilityEvidence | null {
  const drifts: number[] = [];
  for (const activity of activities) {
    if (activity.sport !== "running" || activity.hr_drift_pct == null) continue;
    const age = daysBetween(romeDay(activity.started_at), today);
    if (age < 0 || age >= LONG_RUN_DAYS) continue;
    const seconds = activity.moving_time_s ?? activity.duration_s ?? 0;
    // Fuori scala: sensore del cuore sbagliato, non tenuta.
    if (seconds < DURABILITY_MIN_S || activity.hr_drift_pct < -5 || activity.hr_drift_pct > 30) continue;
    drifts.push(activity.hr_drift_pct);
  }
  return drifts.length ? { drift_pct: Math.round(median(drifts) * 10) / 10, runs: drifts.length } : null;
}

/**
 * Km a settimana (ultime 4 settimane) e lungo più lungo (ultime 8) dalle
 * corse; se le corse portano tratti e deriva cardiaca, anche il passo di
 * soglia e la tenuta nei lunghi.
 */
export function enduranceBase(activities: EnduranceActivity[], today: string): EnduranceBase {
  let volume = 0;
  let longest = 0;
  for (const activity of activities) {
    if (activity.sport !== "running") continue;
    const age = daysBetween(romeDay(activity.started_at), today);
    if (age < 0) continue;
    if (age < VOLUME_DAYS) volume += activity.distance_m;
    if (age < LONG_RUN_DAYS) longest = Math.max(longest, activity.distance_m);
  }
  return {
    weekly_km: Math.round((volume / 1000 / (VOLUME_DAYS / 7)) * 10) / 10,
    longest_m: longest,
    threshold: thresholdEvidence(activities, today),
    durability: durabilityEvidence(activities, today),
  };
}

export function predictTimeRange(
  reference: PredictionReference,
  meters: number,
  base: EnduranceBase,
  today: string,
): RaceRange {
  return predictRange({
    reference,
    reference_age_days: Math.max(0, daysBetween(romeDay(reference.started_at), today)),
    target_m: meters,
    base,
  });
}

export function predictRaceTimes(reference: PredictionReference, base: EnduranceBase, today: string): RacePrediction[] {
  return PREDICTION_DISTANCES.map((distance) => ({
    label: distance.label,
    meters: distance.meters,
    range: predictTimeRange(reference, distance.meters, base, today),
  }));
}

// ── Testi ───────────────────────────────────────────────────────────────────

/** Sotto questa copertura volume o lungo vengono citati come causa. */
const WEAK_COVER = 0.75;
/** Oltre questa età (giorni) il riferimento viene citato come poco recente. */
const OLD_REFERENCE_DAYS = 42;

/** «sui 5 km», «sulla mezza»: distanza con la preposizione giusta. */
function onDistance(meters: number): string {
  if (Math.abs(meters - 21_097) < 1) return "sulla mezza";
  if (Math.abs(meters - 42_195) < 1) return "sulla maratona";
  const km = meters / 1000;
  return `sui ${Number.isInteger(km) ? km : km.toFixed(1).replace(".", ",")} km`;
}

/** «i 5 km», «la mezza»: distanza con l'articolo. */
function theDistance(meters: number): string {
  if (Math.abs(meters - 21_097) < 1) return "la mezza";
  if (Math.abs(meters - 42_195) < 1) return "la maratona";
  const km = meters / 1000;
  return `i ${Number.isInteger(km) ? km : km.toFixed(1).replace(".", ",")} km`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
}

const shortDay = (date: string) => shortDate(`${date}T12:00:00Z`);

/**
 * Su cosa si basa la forbice e cosa la stringe o la allarga, in italiano
 * semplice: la prova, le sedute di soglia (e se concordano), la tenuta nei
 * lunghi, volume e lungo.
 */
export function rangeExplanation(
  reference: PredictionReference,
  range: RaceRange,
  base: EnduranceBase,
  today: string,
): string {
  const longer = range.target_m > reference.meters;
  const effort = range.sources?.find((source) => source.kind === "effort");
  const pace = range.sources?.find((source) => source.kind === "threshold");
  const sentences: string[] = [];
  if (effort && pace && base.threshold) {
    const days = base.threshold.dates.slice(0, 2).reverse().map(shortDay).join(" e del ");
    const sessions = base.threshold.sessions === 1 ? `la seduta di soglia del ${days}` : `le sedute di soglia del ${days}`;
    sentences.push(
      `Combina ${theDistance(reference.meters)} del ${shortDate(reference.started_at)} (da soli: ${formatDuration(effort.central_s)}) e ${sessions} a ${formatPace(base.threshold.pace_s_km)} (${formatDuration(pace.central_s)}).`,
    );
    const agreement = range.agreement ?? 0;
    sentences.push(
      agreement >= 0.6
        ? "I due dati concordano, quindi la forbice è più stretta."
        : agreement > 0
          ? "I due dati sono vicini ma non uguali."
          : "I due dati non concordano: la forbice li contiene entrambi.",
    );
  } else {
    sentences.push(`Si basa ${onDistance(reference.meters)} del ${shortDate(reference.started_at)}.`);
  }
  if (longer && base.durability && range.durability_factor != null && range.durability_factor !== 1) {
    const drift = String(base.durability.drift_pct).replace(".", ",");
    sentences.push(
      range.durability_factor < 1
        ? `Nei lunghi il cuore resta stabile (deriva ${drift}%): un punto a favore.`
        : `Nei lunghi il cuore sale molto (deriva ${drift}%): la tenuta è da costruire.`,
    );
  }
  const causes: string[] = [];
  if (longer && range.volume_cover < WEAK_COVER) causes.push(`il volume basso (${Math.round(base.weekly_km)} km a settimana)`);
  if (longer && range.long_cover < WEAK_COVER) causes.push(`il lungo corto (massimo ${Math.round(base.longest_m / 1000)} km)`);
  if (daysBetween(romeDay(reference.started_at), today) > OLD_REFERENCE_DAYS) causes.push("una prova non recente");
  if (causes.length === 0) {
    if (!pace) sentences.push("Volume e lungo sono adeguati, la forbice è stretta.");
  } else {
    const verb = causes.length > 1 ? "tengono" : "tiene";
    const where = longer && (range.volume_cover < WEAK_COVER || range.long_cover < WEAK_COVER) ? " verso il prudente" : "";
    sentences.push(`${causes.join(" e ").replace(/^./, (c) => c.toUpperCase())} ${verb} larga la forbice${where}.`);
  }
  return sentences.join(" ");
}

export function rangeLabel(range: RaceRange): string {
  return `${formatDuration(range.optimistic_s)}–${formatDuration(range.prudent_s)}`;
}

/** Frase onesta su obiettivo e passo di partenza. */
export function paceAdviceText(advice: PaceAdvice, range: RaceRange, goal_s: number | null): string {
  const pace = `${formatPace(advice.fast_s_km).replace("/km", "")}–${formatPace(advice.slow_s_km)}`;
  if (goal_s == null || advice.goal_fit == null) return `Passo di partenza consigliato ${pace}.`;
  const goal = formatDuration(goal_s);
  if (advice.goal_fit === "too_fast") {
    return `L'obiettivo ${goal} oggi è fuori dalla forbice (serve meglio di ${formatDuration(range.optimistic_s)}): parti prudente a ${pace} e decidi dopo metà gara.`;
  }
  if (advice.goal_fit === "too_slow") {
    return `L'obiettivo ${goal} è più lento anche della stima prudente: è alla portata, parti a ${pace}.`;
  }
  if (advice.goal_ambitious) {
    return `L'obiettivo ${goal} è dentro la forbice ma sul lato veloce: serve una giornata buona. Parti a ${pace}, non a ${formatPace(advice.goal_pace_s_km)}, e accelera solo nel finale se stai bene.`;
  }
  return `L'obiettivo ${goal} è dentro la forbice: parti a ${pace}.`;
}

export interface GoalRaceRange {
  range: RaceRange;
  advice: PaceAdvice;
  explanation: string;
  advice_text: string;
}

/** Tutto quello che serve a UI e coach per la distanza dell'obiettivo. */
export function goalRaceRange(
  reference: PredictionReference,
  base: EnduranceBase,
  goal: { distance_m: number; target_time_s: number | null },
  today: string,
): GoalRaceRange {
  const range = predictTimeRange(reference, goal.distance_m, base, today);
  const advice = racePaceAdvice(range, goal.target_time_s);
  return {
    range,
    advice,
    explanation: rangeExplanation(reference, range, base, today),
    advice_text: paceAdviceText(advice, range, goal.target_time_s),
  };
}
