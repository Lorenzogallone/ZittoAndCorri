// App languages. No path prefix (/it, /en): it is an installed PWA,
// the language is chosen in settings (or on first launch) and
// lives in a cookie. Pure module: tests import it too.

export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * One message file per area (messages/<language>/<area>.json), so several
 * people or agents can translate different areas without conflicts. Each
 * new area must be added here.
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
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Translator passed to lib/ functions (obtained from useTranslations / getTranslations). */
export type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * BCP 47 label for Intl (dates, numbers). English uses en-GB: same
 * day-month order and 24-hour time as Italian, only names and separators change.
 */
export const intlLocale = (locale: Locale): string => (locale === "en" ? "en-GB" : "it-IT");

/** Language from the cookie; without a cookie, from Accept-Language (Italian or English). */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("it")) return "it";
  if (first) return "en";
  return DEFAULT_LOCALE;
}
