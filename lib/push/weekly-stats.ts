// Deterministic stats for the week (Monday–Sunday, Rome time) used by the
// Monday recap. Pure module: relative imports only, testable.

import { DEFAULT_LOCALE, intlLocale, type Locale, type Translator } from "../../i18n/config.ts";

export interface WeekRange {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Sunday, YYYY-MM-DD. */
  end: string;
}

export interface WeeklyActivity {
  started_at: string;
  sport: string;
  distance_m: number | null;
}

export interface WeeklyPlanned {
  date: string;
  type: string;
}

export interface WeeklyStats {
  week_start: string;
  week_end: string;
  running_km: number;
  activities: number;
  planned: number;
  /** Planned sessions on days with at least one matching activity. */
  planned_done: number;
  longest_run_km: number;
}

/** Calendar date in Rome (YYYY-MM-DD) for an instant. */
export function romeDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Rome date of an ISO timestamp; plain dates are left unchanged. */
export function romeDateOf(timestamp: string): string {
  if (!timestamp.includes("T")) return timestamp.slice(0, 10);
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp.slice(0, 10) : romeDate(parsed);
}

export function shiftIsoDate(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The Monday–Sunday week that ended before the current week in Rome. */
export function previousWeek(now: Date = new Date()): WeekRange {
  const today = romeDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const thisMonday = shiftIsoDate(today, 1 - weekday);
  return { start: shiftIsoDate(thisMonday, -7), end: shiftIsoDate(thisMonday, -1) };
}

const roundKm = (meters: number) => Math.round(meters / 100) / 10;

export function computeWeeklyStats(
  week: WeekRange,
  activities: WeeklyActivity[],
  planned: WeeklyPlanned[],
): WeeklyStats {
  const inWeek = (date: string) => date >= week.start && date <= week.end;
  const acts = activities
    .map((a) => ({ ...a, date: romeDateOf(a.started_at) }))
    .filter((a) => inWeek(a.date));
  const runs = acts.filter((a) => a.sport === "running");
  const runDays = new Set(runs.map((a) => a.date));
  const activeDays = new Set(acts.map((a) => a.date));
  const plan = planned.filter((p) => inWeek(p.date.slice(0, 10)));
  // A "cross" session counts with any activity that day, the others with a run.
  const done = plan.filter((p) => {
    const date = p.date.slice(0, 10);
    return p.type === "cross" ? activeDays.has(date) : runDays.has(date);
  });
  const runMeters = runs.map((a) => Math.max(0, a.distance_m ?? 0));

  return {
    week_start: week.start,
    week_end: week.end,
    running_km: roundKm(runMeters.reduce((sum, m) => sum + m, 0)),
    activities: acts.length,
    planned: plan.length,
    planned_done: done.length,
    longest_run_km: roundKm(Math.max(0, ...runMeters)),
  };
}

/** Kilometres in the user's number format: 32,4 km / 32.4 km. */
export function formatKm(km: number, locale: Locale = DEFAULT_LOCALE): string {
  return `${km.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

const outings = (n: number, t: Translator) => t("weekly.outings", { count: n });

/** Notification body: "32,4 km · 4 uscite · piano 3/4" (`t` bound to the "push" namespace). */
export function weeklyPushBody(stats: WeeklyStats, t: Translator, locale: Locale = DEFAULT_LOCALE): string {
  const parts: string[] = [];
  if (stats.running_km > 0) parts.push(formatKm(stats.running_km, locale));
  parts.push(stats.activities ? outings(stats.activities, t) : t("weekly.noOutings"));
  if (stats.planned) parts.push(t("weekly.plan", { done: stats.planned_done, total: stats.planned }));
  return parts.join(" · ");
}

/** Text recap without AI, built only from the numbers (`t` bound to the "push" namespace). */
export function deterministicWeeklyRecap(stats: WeeklyStats, t: Translator, locale: Locale = DEFAULT_LOCALE): string {
  const sentences: string[] = [];
  if (stats.activities === 0) {
    sentences.push(t("weekly.recap.emptyWeek", { planned: stats.planned }));
    sentences.push(t("weekly.recap.emptyWeekCalm"));
    return sentences.join(" ");
  }
  sentences.push(stats.running_km > 0
    ? t("weekly.recap.withRuns", { km: formatKm(stats.running_km, locale), outings: outings(stats.activities, t) })
    : t("weekly.recap.noRuns", { outings: outings(stats.activities, t) }));
  if (stats.longest_run_km > 0) sentences.push(t("weekly.recap.longest", { km: formatKm(stats.longest_run_km, locale) }));
  if (stats.planned) {
    sentences.push(t("weekly.recap.planDone", { done: stats.planned_done, planned: stats.planned }));
    const ratio = stats.planned_done / stats.planned;
    sentences.push(t(ratio >= 1 ? "weekly.recap.ratioFull" : ratio >= 0.5 ? "weekly.recap.ratioGood" : "weekly.recap.ratioLow"));
  } else {
    sentences.push(t("weekly.recap.noPlan"));
  }
  return sentences.join(" ");
}
