// Pure functions: race prediction. PLAN.md §7.
//
// Base: Riegel formula T2 = T1 · (D2/D1)^k (Riegel 1981, as reported by
// Vickers & Vertosick). k = 1.06 is the one in the most widespread calculators;
// according to Vickers & Vertosick, Riegel gives 1.05–1.06 for male amateurs aged
// 40-70 and 1.08 for elites.
//
// Vickers & Vertosick 2016, "An empirical study of race times in recreational
// endurance runners", BMC Sports Sci Med Rehabil, doi:10.1186/s13102-016-0052-y
// (N = 2303 amateurs): with k = 1.07 Riegel is well calibrated up to the half but
// underestimates the marathon; their correction with weekly mileage
// is built for the marathon. The sample ran a median of 30 miles
// (~48 km) per week. The study says nothing about low volume in the half:
// applying a volume penalty there too is our own ASSUMPTION, motivated
// by the fact that someone who runs far less than the median is outside the population
// on which 1.07 was calibrated.
//
// Hence the range:
// - optimistic: k = 1.06, classic Riegel ("trained" endurance);
// - central: k = 1.07 (Vickers' mean) plus an endurance penalty
//   when volume and long run are below those of the sample on which 1.07 was
//   measured;
// - cautious: the central plus a margin that grows with the same penalty.
// When the reference is old the range widens in both directions.
// Constants without a direct source are marked ASSUMPTION with the reason.

import type { RacePredict } from "@/lib/types";

/** Classic Riegel exponent (Riegel 1981): optimistic end. */
export const RIEGEL_K = 1.06;
/** Mean exponent for amateurs, calibrated up to the half (Vickers & Vertosick 2016). */
export const RECREATIONAL_K = 1.07;
/**
 * Weekly volume (km) of the Vickers & Vertosick sample (median 30 mi).
 * Below this volume the athlete is outside the population on which k = 1.07 is calibrated.
 */
export const REFERENCE_WEEKLY_KM = 48;
/**
 * ASSUMPTION: maximum penalty on the exponent with zero endurance base
 * (k up to 1.12). No source gives this value: it is chosen so that with
 * volume and long run at half of what is needed the half estimated from a 5 km comes out
 * about 5% slower than classic Riegel, a plausible drop for someone who has
 * never covered the distance in training.
 */
export const MAX_ENDURANCE_K_PENALTY = 0.05;
/**
 * ASSUMPTION: minimum uncertainty toward the cautious end, equal to the 1.07 → 1.08 step
 * used by Vickers & Vertosick in the sensitivity analysis.
 */
export const BASE_K_SPREAD = 0.01;
/** ASSUMPTION: additional cautious margin with zero endurance base (uncertainty, not just the mean). */
export const MAX_EXTRA_K_SPREAD = 0.03;
/**
 * ASSUMPTION: an amateur's form changes by about 1% per month. A
 * reference older than two weeks widens the range by that much.
 */
export const AGE_WIDEN_PER_30D = 0.01;
export const AGE_GRACE_DAYS = 14;
export const MAX_AGE_WIDEN = 0.04;
/**
 * ASSUMPTION (training practice): a long run equal to the race distance
 * covers the half; for the marathon long runs rarely exceed 30 km.
 */
export const LONG_RUN_CAP_M = 30_000;

// ── More data: threshold and endurance ──────────────────────────────────────
//
// A single effort (usually 5 km) must be extrapolated by more than 4 times to reach
// the half. Threshold sessions give a second estimate closer to the
// distance: threshold pace is by definition the one you can hold for about
// an hour in a race (Daniels, "Daniels' Running Formula": T pace ≈ pace of a
// 60-minute race). Sustained segments therefore become a "60-minute
// effort" and go through the same formula as the real effort.

/** Duration of the race equivalent to threshold pace (Daniels: about 60 minutes). */
export const THRESHOLD_RACE_S = 3600;
/**
 * ASSUMPTION: threshold sessions are not a race. The pace of segments with
 * recovery in between is a bit easier than 60 continuous minutes, but they are often
 * run below true threshold: the two effects compensate, yet the data is worth
 * less than a maximal effort. Hence the lower starting weight.
 */
export const THRESHOLD_BASE_WEIGHT = 0.8;
/**
 * ASSUMPTION: how far the pace of the threshold segments can deviate from the true pace
 * of a 60-minute race, up or down (recoveries in between, the day,
 * sessions run below threshold). 2.5% is about 8 s/km at 5:20/km: the order of
 * magnitude of the difference between a controlled session and an all-out one.
 */
export const THRESHOLD_UNCERTAINTY = 0.025;
/**
 * Two independent estimates with similar uncertainty, if they agree, halve the
 * variance: the error drops by 1/√2, i.e. the range narrows by 29%.
 * This holds for the uncertainty about form; the one about endurance beyond the longest
 * long run does not change, because neither estimate measures it.
 */
export const AGREEMENT_SHRINK = 1 - Math.SQRT1_2;
/** ASSUMPTION: beyond a 4% distance between estimates there is no agreement and the range does not narrow. */
export const AGREEMENT_SPAN = 0.04;
/**
 * ASSUMPTION (training practice): heart rate drift under 5% in a
 * long run indicates good aerobic endurance, over 10% poor. Endurance shifts the
 * endurance penalty by at most 25% either way: it measures the heart at easy
 * pace, not race pace, so it counts but does not decide.
 */
export const DRIFT_GOOD_PCT = 3;
export const DRIFT_POOR_PCT = 10;
export const MAX_DURABILITY_SHIFT = 0.25;

/** Riegel with explicit exponent. */
export function riegelK(d1_m: number, t1_s: number, d2_m: number, k: number): number {
  if (d1_m <= 0 || t1_s <= 0 || d2_m <= 0) {
    throw new Error("riegel: distanza e tempo devono essere positivi");
  }
  return t1_s * (d2_m / d1_m) ** k;
}

/**
 * Riegel prediction: T1/D1 is the reference performance (in seconds and meters),
 * D2 is the target distance (in meters).
 */
export function riegel(d1_m: number, t1_s: number, d2_m: number): number {
  return Math.round(riegelK(d1_m, t1_s, d2_m, RIEGEL_K));
}

/**
 * Produces Riegel estimates for the canonical distances (5k/10k/half) plus an optional
 * custom target distance. best is the reference run.
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

// ── Range ───────────────────────────────────────────────────────────────────

export interface EnduranceBase {
  /** Average km per week in the last 4 weeks (running only). */
  weekly_km: number;
  /** Longest run of the last 8 weeks (m). */
  longest_m: number;
  /** Pace sustained in recent threshold sessions: a second estimate, independent of the effort. */
  threshold?: ThresholdEvidence | null;
  /** Endurance in long runs: how much the heart rate rises at constant pace. */
  durability?: DurabilityEvidence | null;
}

export interface ThresholdEvidence {
  /** Average pace of the sustained segments, weighted by duration and recency (s/km). */
  pace_s_km: number;
  sessions: number;
  /** Days since the most recent session. */
  age_days: number;
  /** Dates (ISO) of the sessions used, most recent first. */
  dates: string[];
}

export interface DurabilityEvidence {
  /** Median heart rate drift (%) in recent long runs. */
  drift_pct: number;
  runs: number;
}

export interface RangeInput {
  reference: { meters: number; time_s: number };
  /** Days elapsed since the reference effort. */
  reference_age_days: number;
  target_m: number;
  base: EnduranceBase;
}

export interface RaceRange {
  target_m: number;
  optimistic_s: number;
  central_s: number;
  prudent_s: number;
  /** Coverage 0–1 of weekly volume relative to the required one. */
  volume_cover: number;
  /** Coverage 0–1 of the long run relative to the distance. */
  long_cover: number;
  /** Relative widening due to the age of the reference (0–MAX_AGE_WIDEN). */
  age_widen: number;
  k: { optimistic: number; central: number; prudent: number };
  /** Combined estimates, if more than one: what each would say alone and how much it weighs. */
  sources?: RangeSource[];
  /** Agreement 0–1 between the estimates (1 = identical): the more they agree, the more the range narrows. */
  agreement?: number;
  /** Factor applied to the endurance penalty for endurance in long runs (1 = none). */
  durability_factor?: number;
}

export interface RangeSource {
  kind: "effort" | "threshold";
  central_s: number;
  /** Weight 0–1 in the combined estimate (the sum is 1). */
  weight: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round10 = (s: number) => Math.round(s / 10) * 10;

/**
 * Weekly volume required for the distance. For half and beyond it is the volume
 * of the Vickers sample; ASSUMPTION: below the half it scales with distance
 * (a 10 km asks for about half the base of a half).
 */
export function requiredWeeklyKm(target_m: number): number {
  return REFERENCE_WEEKLY_KM * Math.min(1, target_m / 21_097);
}

/** Volume and long run coverage for the target distance, 0–1 each. */
export function enduranceCover(base: EnduranceBase, target_m: number): { volume: number; long: number } {
  return {
    volume: clamp01(base.weekly_km / requiredWeeklyKm(target_m)),
    long: clamp01(base.longest_m / Math.min(target_m, LONG_RUN_CAP_M)),
  };
}

/** Factor on the endurance penalty from long-run endurance: 0.75 (excellent) – 1.25 (poor). */
export function durabilityFactor(durability: DurabilityEvidence | null | undefined): number {
  if (!durability || durability.runs < 1) return 1;
  const position = clamp01((durability.drift_pct - DRIFT_GOOD_PCT) / (DRIFT_POOR_PCT - DRIFT_GOOD_PCT));
  return 1 - MAX_DURABILITY_SHIFT + position * 2 * MAX_DURABILITY_SHIFT;
}

/** Range from a single effort (real or equivalent), without rounding. */
function singleRange(reference: { meters: number; time_s: number }, age_days: number, target_m: number, base: EnduranceBase) {
  const cover = enduranceCover(base, target_m);
  const longer = target_m > reference.meters;
  // Readiness 0–1: simple mean of volume and long run, equal weights (no
  // evidence to weigh them differently), corrected by endurance in long runs.
  const durability = longer ? durabilityFactor(base.durability) : 1;
  const gap = longer ? clamp01((1 - (cover.volume + cover.long) / 2) * durability) : 0;
  const kCentral = RECREATIONAL_K + gap * MAX_ENDURANCE_K_PENALTY;
  const kPrudent = kCentral + BASE_K_SPREAD + gap * MAX_EXTRA_K_SPREAD;
  const age_widen = Math.min(MAX_AGE_WIDEN, Math.max(0, age_days - AGE_GRACE_DAYS) / 30 * AGE_WIDEN_PER_30D);
  const at = (k: number) => riegelK(reference.meters, reference.time_s, target_m, k);
  // Toward shorter distances a higher k gives lower times: sort by time.
  const [low, mid, high] = [at(RIEGEL_K), at(kCentral), at(kPrudent)].sort((x, y) => x - y);
  // Share of the cautious margin due to never-demonstrated endurance (not to
  // form): another estimate of form does not reduce it.
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
 * Weight of an estimate: decreases the more you extrapolate (on a logarithmic scale, like
 * the formula) and as the data ages.
 */
function sourceWeight(reference_m: number, target_m: number, age_days: number, baseWeight: number): number {
  const stretch = Math.abs(Math.log(target_m / reference_m));
  const fresh = Math.max(0.4, 1 - Math.max(0, age_days - AGE_GRACE_DAYS) / 90);
  return (baseWeight / (1 + stretch)) * fresh;
}

/**
 * Optimistic–central–cautious range for `target_m`.
 * The endurance penalty applies only when extrapolating toward a distance longer
 * than the reference: toward shorter distances volume and long run matter little.
 * With threshold sessions the estimate is the weighted mean (on the logarithms of the
 * times) of two independent estimates: if they agree the range narrows, if
 * they diverge it widens until it contains both.
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

  // Threshold sessions as a 60-minute effort at threshold pace.
  const equivalent = { meters: (THRESHOLD_RACE_S / threshold.pace_s_km) * 1000, time_s: THRESHOLD_RACE_S };
  const paceRange = singleRange(equivalent, threshold.age_days, target_m, base);
  // Not a maximal effort: its range already starts wider.
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
  // Toward the cautious end only the uncertainty about form narrows: the margin for
  // the distance never covered in training stays whole.
  const endurance = Math.min(prudent - central, blend(effort.enduranceMargin || 1e-9, pace.enduranceMargin || 1e-9));
  prudent = central + (prudent - central - endurance) * shrink + endurance;
  // In disagreement the range must contain both central estimates.
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

// ── Recommended race pace ───────────────────────────────────────────────────

export type GoalFit = "inside" | "too_fast" | "too_slow";

export interface PaceAdvice {
  /** Recommended starting pace (s/km): faster and slower. */
  fast_s_km: number;
  slow_s_km: number;
  /** null without a goal time. */
  goal_fit: GoalFit | null;
  goal_pace_s_km: number | null;
  /** The goal is inside the range but faster than the central prediction. */
  goal_ambitious: boolean;
}

const round5 = (s: number) => Math.round(s / 5) * 5;

/**
 * Starting pace: from the central prediction halfway toward the
 * cautious one. Starting slower than the expected average and speeding up at the end is
 * established practice (negative split); with low volume the risk is the
 * drop in the last km, not the seconds lost at the start. If the goal is
 * inside the range and slower than the central, the goal pace becomes
 * the fast end: no need to risk more.
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
