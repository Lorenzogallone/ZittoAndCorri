// Totals per period (week, month, year, all time) with the comparison against
// the same stretch of the previous period. Pure functions.

import { intlLocale, type Locale, type Translator } from "../../i18n/config.ts";
import { addDays, mondayOf, romeDay } from "../local-date.ts";

export type TotalsPeriodKey = "week" | "month" | "year" | "all";

export interface TotalsActivity {
  started_at: string;
  sport: string;
  distance_m: number;
  duration_s: number;
  moving_time_s?: number | null;
  elevation_gain_m?: number | null;
}

export interface PeriodTotals {
  key: TotalsPeriodKey;
  label: string;
  /** Description of the period, e.g. "ottobre 2026". */
  caption: string;
  running_m: number;
  runs: number;
  seconds: number;
  elevation_m: number;
  longest_m: number;
  /** Walks and hikes in the same period. */
  walking_m: number;
  /**
   * Running km in the same stretch of the previous period (null if it makes no sense);
   * previous_label follows "rispetto": "alla settimana scorsa", "allo stesso punto di settembre"…
   */
  previous_m: number | null;
  previous_label: string | null;
}

interface Range {
  from: string | null;
  to: string;
}

function sum(activities: TotalsActivity[], range: Range) {
  const inRange = activities.filter((activity) => {
    const day = romeDay(activity.started_at);
    return (range.from == null || day >= range.from) && day <= range.to;
  });
  const runs = inRange.filter((activity) => activity.sport === "running");
  return {
    running_m: runs.reduce((total, activity) => total + activity.distance_m, 0),
    runs: runs.length,
    seconds: runs.reduce((total, activity) => total + (activity.moving_time_s ?? activity.duration_s), 0),
    elevation_m: runs.reduce((total, activity) => total + (activity.elevation_gain_m ?? 0), 0),
    longest_m: runs.reduce((max, activity) => Math.max(max, activity.distance_m), 0),
    walking_m: inRange
      .filter((activity) => activity.sport === "walking" || activity.sport === "hiking")
      .reduce((total, activity) => total + activity.distance_m, 0),
  };
}

/** Same date shifted back by `months` months, without overshooting the end of the month. */
function monthsBack(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const monthName = (iso: string, locale: Locale) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { month: "long", timeZone: "UTC" });

/** `t` is bound to the "metrics" namespace; `locale` is needed for month names. */
export function periodTotals(activities: TotalsActivity[], today: string, t: Translator, locale: Locale): PeriodTotals[] {
  const monday = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const previousMonthStart = monthsBack(monthStart, 1);
  const lastYearToday = monthsBack(today, 12);
  const first = activities.reduce<string | null>((min, activity) => {
    const day = romeDay(activity.started_at);
    return !min || day < min ? day : min;
  }, null);

  const week = sum(activities, { from: monday, to: today });
  const month = sum(activities, { from: monthStart, to: today });
  const year = sum(activities, { from: yearStart, to: today });
  const all = sum(activities, { from: null, to: today });

  return [
    {
      key: "week",
      label: t("totals.week.label"),
      caption: t("totals.week.caption"),
      ...week,
      previous_m: sum(activities, { from: addDays(monday, -7), to: addDays(today, -7) }).running_m,
      previous_label: t("totals.week.previous"),
    },
    {
      key: "month",
      label: t("totals.month.label"),
      caption: t("totals.month.caption", { month: monthName(today, locale), year: today.slice(0, 4) }),
      ...month,
      previous_m: sum(activities, { from: previousMonthStart, to: monthsBack(today, 1) }).running_m,
      previous_label: t("totals.month.previous", { month: monthName(previousMonthStart, locale) }),
    },
    {
      key: "year",
      label: t("totals.year.label"),
      caption: today.slice(0, 4),
      ...year,
      previous_m: sum(activities, { from: `${lastYearToday.slice(0, 4)}-01-01`, to: lastYearToday }).running_m,
      previous_label: t("totals.year.previous", { year: lastYearToday.slice(0, 4) }),
    },
    {
      key: "all",
      label: t("totals.all.label"),
      caption: first
        ? t("totals.all.since", { date: new Date(`${first}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }) })
        : "",
      ...all,
      previous_m: null,
      previous_label: null,
    },
  ];
}
