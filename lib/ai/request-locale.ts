import "server-only";

import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, type Locale } from "../../i18n/config.ts";

/**
 * Lingua della richiesta in corso (cookie dell'app). Cron, import da orologio e
 * altri job senza richiesta non l'hanno: lì resta l'italiano.
 */
export async function requestLocale(): Promise<Locale> {
  try {
    return (await getLocale()) as Locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}
