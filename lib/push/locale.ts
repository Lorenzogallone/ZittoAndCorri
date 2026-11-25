// Pure helper: pick a saved locale, falling back when missing or invalid.
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/config.ts";

export function localeOrDefault(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback;
}
