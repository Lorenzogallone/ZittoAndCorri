// Totali per periodo (settimana, mese, anno, sempre) con il confronto rispetto
// allo stesso tratto del periodo precedente. Funzioni pure.

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
  /** Descrizione del periodo, es. "ottobre 2026". */
  caption: string;
  running_m: number;
  runs: number;
  seconds: number;
  elevation_m: number;
  longest_m: number;
  /** Camminate ed escursioni nello stesso periodo. */
  walking_m: number;
  /**
   * Km di corsa nello stesso tratto del periodo precedente (null se non ha senso);
   * previous_label segue "rispetto": "alla settimana scorsa", "allo stesso punto di settembre"…
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

/** Stessa data spostata indietro di `months` mesi, senza sforare la fine del mese. */
function monthsBack(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const monthName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });

export function periodTotals(activities: TotalsActivity[], today: string): PeriodTotals[] {
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
      label: "Settimana",
      caption: "da lunedì",
      ...week,
      previous_m: sum(activities, { from: addDays(monday, -7), to: addDays(today, -7) }).running_m,
      previous_label: "alla settimana scorsa",
    },
    {
      key: "month",
      label: "Mese",
      caption: `${monthName(today)} ${today.slice(0, 4)}`,
      ...month,
      previous_m: sum(activities, { from: previousMonthStart, to: monthsBack(today, 1) }).running_m,
      previous_label: `allo stesso punto di ${monthName(previousMonthStart)}`,
    },
    {
      key: "year",
      label: "Anno",
      caption: today.slice(0, 4),
      ...year,
      previous_m: sum(activities, { from: `${lastYearToday.slice(0, 4)}-01-01`, to: lastYearToday }).running_m,
      previous_label: `allo stesso punto del ${lastYearToday.slice(0, 4)}`,
    },
    {
      key: "all",
      label: "Sempre",
      caption: first
        ? `dal ${new Date(`${first}T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" })}`
        : "",
      ...all,
      previous_m: null,
      previous_label: null,
    },
  ];
}
