// Date "di calendario" nel fuso dell'atleta (Europe/Rome). Funzioni pure,
// usabili da pagine server, client e test. Le etichette seguono la lingua
// passata (italiano di default).

import { DEFAULT_LOCALE, intlLocale, type Locale } from "../i18n/config.ts";

const ROME = "Europe/Rome";

/** Giorno YYYY-MM-DD a Roma di un timestamp ISO (o di oggi). */
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

/** Ora (0-23) a Roma di un timestamp ISO. */
export function romeHour(timestamp: string): number | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: ROME, hour: "2-digit", hour12: false }).format(date);
  return Number(hour) % 24;
}

/** Sposta una data YYYY-MM-DD di `days` giorni. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Giorni tra due date YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Indice del giorno della settimana con lunedì = 0. */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Lunedì della settimana che contiene la data. */
export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** "mercoledì": il giorno della settimana per esteso. */
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

/** "Oggi", "Domani", "Ieri" oppure "giovedì 16 ottobre". */
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
