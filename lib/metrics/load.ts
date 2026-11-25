// Pure functions: hybrid HR/RPE load + rolling ATL/CTL/TSB windows.
//
// The score favours the heart response (minutes weighted by zone), uses
// RPE as a fallback on the same 1-5 scale and falls back to a cautious estimate
// from duration only when both are missing. The 7-day load is a rolling sum,
// like the Training Load shown by Zepp; the scale stays internal though because
// Zepp's proprietary EPOC can't be reproduced from the exported files alone.

import type { ATLCTLResult, Sport, TimeInZone, ZoneKey } from "@/lib/types";
import { ZONE_LOWER_PCT } from "./zones.ts";

export interface TrainingLoadActivity {
  started_at: string;
  duration_s: number;
  rpe: number | null;
  avg_hr?: number | null;
  time_in_zone?: TimeInZone | null;
  sport?: Sport | null;
}

export interface TrainingLoadProfile {
  max_hr: number | null;
  resting_hr: number | null;
}

export type SessionLoadSource = "heart_rate" | "rpe" | "estimated";

const ZONE_WEIGHT: Record<ZoneKey, number> = {
  z1: 1,
  z2: 2,
  z3: 3,
  z4: 4,
  z5: 5,
};

const ZONES = Object.keys(ZONE_WEIGHT) as ZoneKey[];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fallbackWeight(sport: Sport | null | undefined): number {
  if (sport === "walking" || sport === "yoga" || sport === "pilates") return 1;
  if (["soccer", "beach_volley", "tennis", "padel"].includes(sport ?? "")) return 3;
  return 2;
}

function weightFromAverageHr(
  avgHr: number | null | undefined,
  profile: TrainingLoadProfile | null | undefined,
): number | null {
  if (avgHr == null || profile?.max_hr == null || profile.resting_hr == null) return null;
  const reserve = profile.max_hr - profile.resting_hr;
  if (reserve <= 0) return null;
  // Same cut-offs as the zones (heart rate reserve, like Zepp).
  const ratio = (avgHr - profile.resting_hr) / reserve;
  if (ratio < ZONE_LOWER_PCT.z2) return 1;
  if (ratio < ZONE_LOWER_PCT.z3) return 2;
  if (ratio < ZONE_LOWER_PCT.z4) return 3;
  if (ratio < ZONE_LOWER_PCT.z5) return 4;
  return 5;
}

function romeDate(timestamp: string): string {
  if (!timestamp.includes("T")) return timestamp.slice(0, 10);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function sumRange(values: number[], from: number, to: number): number {
  let sum = 0;
  for (let index = Math.max(0, from); index <= to && index < values.length; index++) {
    sum += values[index];
  }
  return sum;
}

/** Complete weeks that make up the baseline. */
const BASELINE_WEEKS = 4;
/** Minimum complete weeks before comparing the load with the baseline. */
const BASELINE_MIN_WEEKS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Usual weekly load: median of the last 4 complete weeks preceding
 * the current 7 days. The median isn't dragged down by an abnormal week
 * (illness, travel, return to training), which with the mean
 * inflated the ratio and made a normal load look "fatigued".
 */
function baselineWeekly(dailyLoads: number[], index: number): number | null {
  const weeks: number[] = [];
  for (let week = 1; week <= BASELINE_WEEKS; week++) {
    const end = index - 7 * week;
    const start = end - 6;
    if (start < 0) break;
    weeks.push(sumRange(dailyLoads, start, end));
  }
  if (weeks.length < BASELINE_MIN_WEEKS) return null;
  const value = median(weeks);
  return value > 0 ? value : null;
}

function statusFromRatio(
  ratio: number | null,
): ATLCTLResult["status"] {
  if (ratio == null) return "calibrating";
  if (ratio < 0.9) return "fresh";
  if (ratio <= 1.25) return "balanced";
  if (ratio <= 1.5) return "strained";
  return "fatigued";
}

/**
 * Load of a session on an internal scale of 1-5 points/minute.
 * Priority: HR distribution, average HR, RPE, per-sport estimate.
 */
export function sessionLoad(
  activity: Omit<TrainingLoadActivity, "started_at">,
  profile?: TrainingLoadProfile | null,
): { load: number; source: SessionLoadSource } {
  const durationMinutes = Math.max(0, activity.duration_s) / 60;
  const zones = activity.time_in_zone;
  if (zones) {
    const coveredSeconds = ZONES.reduce((sum, zone) => sum + Math.max(0, zones[zone] ?? 0), 0);
    if (coveredSeconds > 0) {
      const weightedSeconds = ZONES.reduce(
        (sum, zone) => sum + Math.max(0, zones[zone] ?? 0) * ZONE_WEIGHT[zone],
        0,
      );
      const averageWeight = weightedSeconds / coveredSeconds;
      return { load: Math.round(durationMinutes * averageWeight), source: "heart_rate" };
    }
  }

  const hrWeight = weightFromAverageHr(activity.avg_hr, profile);
  if (hrWeight != null) {
    return { load: Math.round(durationMinutes * hrWeight), source: "heart_rate" };
  }

  if (activity.rpe != null) {
    // RPE 1-10 is brought back to the 1-5 heart scale; avoids a
    // missing or high RPE making the fallback twice as heavy as the HR load.
    const rpeWeight = Math.min(5, Math.max(1, activity.rpe / 2));
    return { load: Math.round(durationMinutes * rpeWeight), source: "rpe" };
  }

  return {
    load: Math.round(durationMinutes * fallbackWeight(activity.sport)),
    source: "estimated",
  };
}

/**
 * Computes the 7-day rolling load, ATL (7-day average), CTL (42-day average) and
 * TSB = CTL - ATL. The baseline is the median of the 4 complete weeks
 * preceding the current 7 days; with fewer than 3 preceding weeks the state is
 * explicitly "calibrating" and raises no fatigue alarms.
 */
export function computeATLCTL(
  activities: TrainingLoadActivity[],
  asOfDate: string = romeDate(new Date().toISOString()),
  profile?: TrainingLoadProfile | null,
): ATLCTLResult {
  if (activities.length === 0) {
    return {
      load7: 0,
      atl: 0,
      ctl: 0,
      tsb: 0,
      baseline7: null,
      load_ratio: null,
      status: "calibrating",
      confidence: "low",
      history_days: 0,
      sources: { heart_rate: 0, rpe: 0, estimated: 0 },
      series: [],
    };
  }

  const loadByDate = new Map<string, number>();
  const sources = { heart_rate: 0, rpe: 0, estimated: 0 };
  for (const a of activities) {
    const date = romeDate(a.started_at);
    if (date > asOfDate) continue;
    const { load, source } = sessionLoad(a, profile);
    loadByDate.set(date, (loadByDate.get(date) ?? 0) + load);
    sources[source] += 1;
  }
  if (loadByDate.size === 0) return computeATLCTL([], asOfDate, profile);

  const sorted = [...loadByDate.keys()].sort();
  const startDate = sorted[0];
  const days: Array<{ date: string; load: number }> = [];
  let cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${asOfDate}T12:00:00Z`);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    days.push({ date: d, load: loadByDate.get(d) ?? 0 });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  const dailyLoads = days.map((day) => day.load);
  const series: ATLCTLResult["series"] = [];
  for (let index = 0; index < days.length; index++) {
    const historyDays = index + 1;
    const load7 = sumRange(dailyLoads, index - 6, index);
    const load42 = sumRange(dailyLoads, index - 41, index);
    const atl = load7 / 7;
    // Until a full chronic window exists, TSB stays neutral:
    // the data is declared as calibrating instead of inventing a form of 0.
    const ctl = historyDays < 42 ? atl : load42 / 42;
    const tsb = ctl - atl;

    const baseline7 = baselineWeekly(dailyLoads, index);
    const loadRatio = baseline7 != null && baseline7 > 0 ? load7 / baseline7 : null;

    series.push({
      date: days[index].date,
      daily_load: days[index].load,
      load7: Math.round(load7),
      atl: round1(atl),
      ctl: round1(ctl),
      tsb: round1(tsb),
      baseline7: baseline7 == null ? null : Math.round(baseline7),
      load_ratio: loadRatio == null ? null : round2(loadRatio),
    });
  }

  const last = series[series.length - 1];
  const includedActivities = sources.heart_rate + sources.rpe + sources.estimated;
  const measuredShare = includedActivities > 0 ? sources.heart_rate / includedActivities : 0;
  const confidence: ATLCTLResult["confidence"] = last.baseline7 == null
    ? "low"
    : measuredShare >= 0.6 && days.length >= 42
      ? "high"
      : "medium";
  return {
    load7: last.load7,
    atl: last.atl,
    ctl: last.ctl,
    tsb: last.tsb,
    baseline7: last.baseline7,
    load_ratio: last.load_ratio,
    status: statusFromRatio(last.load_ratio),
    confidence,
    history_days: days.length,
    sources,
    series,
  };
}

/** TSB (freshness) = CTL - ATL. Positive = fresh, negative = fatigued. */
export function tsb(ctl: number, atl: number): number {
  return Math.round(ctl - atl);
}
