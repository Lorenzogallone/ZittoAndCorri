// Race time prediction from recent best efforts: a range around Riegel
// (see predict.ts for formulas and sources). Pure functions.

import { EFFORTS, type BestEfforts, type EffortKey } from "./best-efforts.ts";
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
import { DEFAULT_LOCALE, intlLocale, type Locale, type Translator } from "../../i18n/config.ts";
import { itMetrics } from "../italian-translator.ts";

export interface PredictionReference {
  meters: number;
  time_s: number;
  activity_id: string;
  /** Start of the run containing the effort (ISO). */
  started_at: string;
}

export interface RacePrediction {
  /** Distance: the name is derived with effortLabel(). */
  key: EffortKey;
  meters: number;
  range: RaceRange;
}

/** Distances shown in the predictions. */
export const PREDICTION_DISTANCES = [
  { key: "5k", meters: 5_000 },
  { key: "10k", meters: 10_000 },
  { key: "half", meters: 21_097 },
  { key: "marathon", meters: 42_195 },
] as const;

/** Minimum distance of a best effort to serve as a reliable reference. */
const MIN_REFERENCE_M = 5_000;

/**
 * The reference is the performance with the best "equivalent 10 km" among
 * best efforts ≥ 5 km. Without best efforts it falls back to whole runs ≥ 3 km.
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

/** Endurance base windows: volume over 4 weeks, long run over 8. */
const VOLUME_DAYS = 28;
const LONG_RUN_DAYS = 56;

/** Threshold sessions of the last 42 days: older ones don't describe today's form. */
const THRESHOLD_DAYS = 42;
/** A "threshold" segment lasts 6 to 30 minutes: shorter is an interval, longer is already a race. */
const THRESHOLD_MIN_S = 360;
const THRESHOLD_MAX_S = 1800;
/** At least 15 minutes of work are needed for the session to say anything. */
const THRESHOLD_MIN_WORK_S = 900;
/** Recent sessions weigh more: the weight halves about every two weeks. */
const THRESHOLD_DECAY_DAYS = 21;
/** Long runs of at least 70 minutes: below that, heart rate drift says little about endurance. */
const DURABILITY_MIN_S = 70 * 60;

/** How much of a run is needed for the endurance base; optional fields add threshold and endurance. */
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

/** Pace sustained in recent threshold sessions (segments of 6 to 30 minutes, at least 15 in total). */
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
    // Session pace: total time divided by total distance of the segments.
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

/** Median heart rate drift in long runs (≥ 70 minutes) of the last 8 weeks. */
export function durabilityEvidence(activities: EnduranceActivity[], today: string): DurabilityEvidence | null {
  const drifts: number[] = [];
  for (const activity of activities) {
    if (activity.sport !== "running" || activity.hr_drift_pct == null) continue;
    const age = daysBetween(romeDay(activity.started_at), today);
    if (age < 0 || age >= LONG_RUN_DAYS) continue;
    const seconds = activity.moving_time_s ?? activity.duration_s ?? 0;
    // Out of range: wrong heart sensor, not endurance.
    if (seconds < DURABILITY_MIN_S || activity.hr_drift_pct < -5 || activity.hr_drift_pct > 30) continue;
    drifts.push(activity.hr_drift_pct);
  }
  return drifts.length ? { drift_pct: Math.round(median(drifts) * 10) / 10, runs: drifts.length } : null;
}

/**
 * Km per week (last 4 weeks) and longest run (last 8) from the
 * runs; if the runs carry segments and heart rate drift, also the threshold
 * pace and the endurance in long runs.
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
    key: distance.key,
    meters: distance.meters,
    range: predictTimeRange(reference, distance.meters, base, today),
  }));
}

// ── Texts ───────────────────────────────────────────────────────────────────
// The texts come from messages/<language>/metrics.json. Without a translator they stay
// in Italian: that way they also serve the coach context (Italian prompt).

/** Below this coverage, volume or long run are cited as the cause. */
const WEAK_COVER = 0.75;
/** Beyond this age (days) the reference is cited as not recent. */
const OLD_REFERENCE_DAYS = 42;

/** Distance for messages: half and marathon have a name, the others are written in km. */
function distanceParams(meters: number, locale: Locale): { kind: "half" | "marathon" | "other"; km: string } {
  const km = meters / 1000;
  const kind = Math.abs(meters - 21_097) < 1 ? "half" : Math.abs(meters - 42_195) < 1 ? "marathon" : "other";
  return { kind, km: km.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 }) };
}

/** «sui 5 km», «sulla mezza»: distance with the right preposition. */
function onDistance(meters: number, t: Translator, locale: Locale): string {
  return t("racePrediction.distanceOn", distanceParams(meters, locale));
}

/** «i 5 km», «la mezza»: distance with the article. */
function theDistance(meters: number, t: Translator, locale: Locale): string {
  return t("racePrediction.distanceThe", distanceParams(meters, locale));
}

function shortDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "Europe/Rome" });
}

const shortDay = (date: string, locale: Locale) => shortDate(`${date}T12:00:00Z`, locale);

/**
 * What the range is based on and what narrows or widens it, in plain
 * Italian: the effort, the threshold sessions (and whether they agree), endurance in
 * long runs, volume and long run.
 */
export function rangeExplanation(
  reference: PredictionReference,
  range: RaceRange,
  base: EnduranceBase,
  today: string,
  t: Translator = itMetrics,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const longer = range.target_m > reference.meters;
  const effort = range.sources?.find((source) => source.kind === "effort");
  const pace = range.sources?.find((source) => source.kind === "threshold");
  const sentences: string[] = [];
  if (effort && pace && base.threshold) {
    // From the oldest session to the most recent, at most two.
    const [first = "", second = ""] = base.threshold.dates.slice(0, 2).reverse().map((date) => shortDay(date, locale));
    const sessions = t("racePrediction.thresholdSessions", { count: base.threshold.sessions === 1 ? 1 : 2, first, second });
    sentences.push(
      t("racePrediction.combines", {
        distance: theDistance(reference.meters, t, locale),
        date: shortDate(reference.started_at, locale),
        effortTime: formatDuration(effort.central_s),
        sessions,
        pace: formatPace(base.threshold.pace_s_km),
        paceTime: formatDuration(pace.central_s),
      }),
    );
    const agreement = range.agreement ?? 0;
    sentences.push(t(agreement >= 0.6 ? "racePrediction.agreement.high" : agreement > 0 ? "racePrediction.agreement.close" : "racePrediction.agreement.low"));
  } else {
    sentences.push(t("racePrediction.basedOn", { distance: onDistance(reference.meters, t, locale), date: shortDate(reference.started_at, locale) }));
  }
  if (longer && base.durability && range.durability_factor != null && range.durability_factor !== 1) {
    const drift = base.durability.drift_pct.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 });
    sentences.push(t(range.durability_factor < 1 ? "racePrediction.durability.steady" : "racePrediction.durability.rising", { drift }));
  }
  const causes: string[] = [];
  if (longer && range.volume_cover < WEAK_COVER) causes.push(t("racePrediction.causes.volume", { km: Math.round(base.weekly_km) }));
  if (longer && range.long_cover < WEAK_COVER) causes.push(t("racePrediction.causes.longRun", { km: Math.round(base.longest_m / 1000) }));
  if (daysBetween(romeDay(reference.started_at), today) > OLD_REFERENCE_DAYS) causes.push(t("racePrediction.causes.oldReference"));
  if (causes.length === 0) {
    if (!pace) sentences.push(t("racePrediction.adequate"));
  } else {
    const joined = causes.reduce((text, cause) => t("racePrediction.causes.join", { first: text, second: cause }));
    sentences.push(
      t("racePrediction.causes.sentence", {
        causes: joined.replace(/^./, (c) => c.toUpperCase()),
        count: causes.length > 1 ? 2 : 1,
        toward: longer && (range.volume_cover < WEAK_COVER || range.long_cover < WEAK_COVER) ? "yes" : "no",
      }),
    );
  }
  return sentences.join(" ");
}

export function rangeLabel(range: RaceRange): string {
  return `${formatDuration(range.optimistic_s)}–${formatDuration(range.prudent_s)}`;
}

/** Honest sentence about goal and starting pace. */
export function paceAdviceText(advice: PaceAdvice, range: RaceRange, goal_s: number | null, t: Translator = itMetrics): string {
  const pace = `${formatPace(advice.fast_s_km).replace("/km", "")}–${formatPace(advice.slow_s_km)}`;
  if (goal_s == null || advice.goal_fit == null) return t("racePrediction.advice.noGoal", { pace });
  const goal = formatDuration(goal_s);
  if (advice.goal_fit === "too_fast") {
    return t("racePrediction.advice.tooFast", { goal, best: formatDuration(range.optimistic_s), pace });
  }
  if (advice.goal_fit === "too_slow") {
    return t("racePrediction.advice.tooSlow", { goal, pace });
  }
  if (advice.goal_ambitious) {
    return t("racePrediction.advice.ambitious", { goal, pace, goalPace: formatPace(advice.goal_pace_s_km) });
  }
  return t("racePrediction.advice.inside", { goal, pace });
}

export interface GoalRaceRange {
  range: RaceRange;
  advice: PaceAdvice;
  explanation: string;
  advice_text: string;
}

/** Everything the UI and coach need for the goal distance. */
export function goalRaceRange(
  reference: PredictionReference,
  base: EnduranceBase,
  goal: { distance_m: number; target_time_s: number | null },
  today: string,
  t: Translator = itMetrics,
  locale: Locale = DEFAULT_LOCALE,
): GoalRaceRange {
  const range = predictTimeRange(reference, goal.distance_m, base, today);
  const advice = racePaceAdvice(range, goal.target_time_s);
  return {
    range,
    advice,
    explanation: rangeExplanation(reference, range, base, today, t, locale),
    advice_text: paceAdviceText(advice, range, goal.target_time_s, t),
  };
}
