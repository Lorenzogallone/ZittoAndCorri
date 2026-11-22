// Previsione dei tempi gara dai best effort recenti: forbice attorno a Riegel
// (vedi predict.ts per formule e fonti). Funzioni pure.

import { EFFORTS, type BestEfforts } from "./best-efforts.ts";
import { predictRange, racePaceAdvice, type EnduranceBase, type PaceAdvice, type RaceRange } from "./predict.ts";
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

/** Km a settimana (ultime 4 settimane) e lungo più lungo (ultime 8) dalle corse. */
export function enduranceBase(
  activities: Array<{ sport: string; started_at: string; distance_m: number }>,
  today: string,
): EnduranceBase {
  let volume = 0;
  let longest = 0;
  for (const activity of activities) {
    if (activity.sport !== "running") continue;
    const age = daysBetween(romeDay(activity.started_at), today);
    if (age < 0) continue;
    if (age < VOLUME_DAYS) volume += activity.distance_m;
    if (age < LONG_RUN_DAYS) longest = Math.max(longest, activity.distance_m);
  }
  return { weekly_km: Math.round((volume / 1000 / (VOLUME_DAYS / 7)) * 10) / 10, longest_m: longest };
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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
}

/** «Si basa sui 5 km del 14 nov; il volume basso (20 km a settimana) allarga la forbice.» */
export function rangeExplanation(
  reference: PredictionReference,
  range: RaceRange,
  base: EnduranceBase,
  today: string,
): string {
  const head = `Si basa ${onDistance(reference.meters)} del ${shortDate(reference.started_at)}`;
  const causes: string[] = [];
  const longer = range.target_m > reference.meters;
  if (longer && range.volume_cover < WEAK_COVER) {
    causes.push(`il volume basso (${Math.round(base.weekly_km)} km a settimana)`);
  }
  if (longer && range.long_cover < WEAK_COVER) {
    causes.push(`il lungo corto (massimo ${Math.round(base.longest_m / 1000)} km)`);
  }
  if (daysBetween(romeDay(reference.started_at), today) > OLD_REFERENCE_DAYS) {
    causes.push("una prova non recente");
  }
  if (causes.length === 0) return `${head}; volume e lungo sono adeguati, la forbice è stretta.`;
  const verb = causes.length > 1 ? "allargano" : "allarga";
  const where = longer && (range.volume_cover < WEAK_COVER || range.long_cover < WEAK_COVER) ? " verso il prudente" : "";
  return `${head}; ${causes.join(" e ")} ${verb} la forbice${where}.`;
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
