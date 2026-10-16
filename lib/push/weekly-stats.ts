// Statistiche deterministiche della settimana (lunedì–domenica, ora di Roma)
// per il riepilogo del lunedì. Modulo puro: solo import relativi, testabile.

export interface WeekRange {
  /** Lunedì, YYYY-MM-DD. */
  start: string;
  /** Domenica, YYYY-MM-DD. */
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
  /** Sedute pianificate in giorni con almeno un'attività coerente. */
  planned_done: number;
  longest_run_km: number;
}

/** Data di calendario a Roma (YYYY-MM-DD) per un istante. */
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

/** Data di Roma di un timestamp ISO; le date pure restano invariate. */
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

/** Settimana lunedì–domenica conclusa prima della settimana corrente a Roma. */
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
  // Una seduta "cross" vale con qualsiasi attività del giorno, le altre con una corsa.
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

/** Chilometri in formato italiano: 32,4 km. */
export function formatKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

const outings = (n: number) => `${n} ${n === 1 ? "uscita" : "uscite"}`;

/** Corpo della notifica: "32,4 km · 4 uscite · piano 3/4". */
export function weeklyPushBody(stats: WeeklyStats): string {
  const parts: string[] = [];
  if (stats.running_km > 0) parts.push(formatKm(stats.running_km));
  parts.push(stats.activities ? outings(stats.activities) : "Nessuna uscita");
  if (stats.planned) parts.push(`piano ${stats.planned_done}/${stats.planned}`);
  return parts.join(" · ");
}

/** Riepilogo testuale senza AI, costruito solo dai numeri. */
export function deterministicWeeklyRecap(stats: WeeklyStats): string {
  const sentences: string[] = [];
  if (stats.activities === 0) {
    sentences.push(`Settimana senza attività registrate, a fronte di ${stats.planned} ${stats.planned === 1 ? "seduta" : "sedute"} in programma.`);
    sentences.push("Nessun problema: si riparte da qui, con calma, seguendo il piano di questa settimana.");
    return sentences.join(" ");
  }
  sentences.push(stats.running_km > 0
    ? `Settimana chiusa con ${formatKm(stats.running_km)} di corsa in ${outings(stats.activities)}.`
    : `Settimana senza corse, ma con ${outings(stats.activities)} di altro tipo.`);
  if (stats.longest_run_km > 0) sentences.push(`L'uscita più lunga è stata di ${formatKm(stats.longest_run_km)}.`);
  if (stats.planned) {
    sentences.push(`Del piano hai svolto ${stats.planned_done} ${stats.planned_done === 1 ? "seduta" : "sedute"} su ${stats.planned}.`);
    const ratio = stats.planned_done / stats.planned;
    sentences.push(ratio >= 1
      ? "Piano rispettato in pieno: continua così anche questa settimana."
      : ratio >= 0.5
        ? "Buona costanza: questa settimana cerca di non saltare le sedute chiave."
        : "Questa settimana punta sulla regolarità: meglio una seduta più corta che una saltata.");
  } else {
    sentences.push("Questa settimana continua con regolarità.");
  }
  return sentences.join(" ");
}
