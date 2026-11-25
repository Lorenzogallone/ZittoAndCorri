// Lingue dell'app. Nessun prefisso nei percorsi (/it, /en): è una PWA
// installata, la lingua si sceglie nelle impostazioni (o al primo avvio) e
// vive in un cookie. Modulo puro: lo importano anche i test.

export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Un file di messaggi per area (messages/<lingua>/<area>.json), così più
 * persone o agenti possono tradurre aree diverse senza conflitti. Ogni area
 * nuova va aggiunta qui.
 */
export const NAMESPACES = [
  "common",
  "onboarding",
  "home",
  "shell",
  "coach",
  "activities",
  "plan",
  "goals",
  "profile",
  "settings",
  "settingsLinks",
  "labels",
  "metrics",
  "status",
  "push",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Traduttore passato alle funzioni di lib/ (ricavato da useTranslations / getTranslations). */
export type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * Etichetta BCP 47 per Intl (date, numeri). L'inglese usa en-GB: stesso ordine
 * giorno-mese e orario 24 ore dell'italiano, cambiano i nomi e i separatori.
 */
export const intlLocale = (locale: Locale): string => (locale === "en" ? "en-GB" : "it-IT");

/** Lingua dal cookie; senza cookie, da Accept-Language (italiano o inglese). */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("it")) return "it";
  if (first) return "en";
  return DEFAULT_LOCALE;
}
