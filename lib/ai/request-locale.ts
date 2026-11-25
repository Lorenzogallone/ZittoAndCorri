import "server-only";

import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, type Locale } from "../../i18n/config.ts";

/**
 * Language of the current request (app cookie). Cron, watch imports and
 * other jobs without a request do not have it: there Italian stays.
 */
export async function requestLocale(): Promise<Locale> {
  try {
    return (await getLocale()) as Locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}
