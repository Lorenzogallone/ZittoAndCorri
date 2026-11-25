// Calendar dates in the athlete's timezone (Europe/Rome). Pure functions,
// usable from server pages, client and tests. Labels follow the language
// passed in (Italian by default).

import { DEFAULT_LOCALE, intlLocale, type Locale } from "../i18n/config.ts";

const ROME = "Europe/Rome";

/** Day YYYY-MM-DD in Rome of an ISO timestamp (or of today). */
export function romeDay(timestamp?: string | Date): string {
  if (typeof timestamp === "string" && !timestamp.includes("T")) return timestamp.slice(0, 10);
  const date = timestamp == null ? new Date() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(timestamp).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Hour (0-23) in Rome of an ISO timestamp. */
export function romeHour(timestamp: string): number | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: ROME, hour: "2-digit", hour12: false }).format(date);
  return Number(hour) % 24;
}

/** Shifts a YYYY-MM-DD date by `days` days. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Weekday index with Monday = 0. */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday of the week containing the date. */
export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** "mercoledì": the full weekday name. */
export function weekdayName(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { weekday: "long", timeZone: "UTC" });
}

/** "lun 14", "mar 15"… */
export function shortDayLabel(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", timeZone: "UTC" })
    .replace(".", "");
}

const RELATIVE_DAYS: Record<Locale, { today: string; tomorrow: string; yesterday: string }> = {
  it: { today: "Oggi", tomorrow: "Domani", yesterday: "Ieri" },
  en: { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" },
};

/** "Oggi", "Domani", "Ieri" or "giovedì 16 ottobre". */
export function relativeDayLabel(iso: string, today: string, locale: Locale = DEFAULT_LOCALE): string {
  const diff = daysBetween(today, iso);
  const words = RELATIVE_DAYS[locale];
  if (diff === 0) return words.today;
  if (diff === 1) return words.tomorrow;
  if (diff === -1) return words.yesterday;
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
