import "server-only";

// Traduttore fuori da una richiesta: cron, notifiche push e testi che finiscono
// nel database non hanno un cookie con la lingua dell'utente. Qui la lingua si
// sceglie a mano (oggi sempre "it").

import { createTranslator } from "next-intl";
import type { Locale, Namespace, Translator } from "../i18n/config.ts";

/** Come getTranslations(namespace), ma con una lingua fissa e senza contesto di richiesta. */
export async function staticTranslator(locale: Locale, namespace: Namespace): Promise<Translator> {
  const messages = (await import(`../messages/${locale}/${namespace}.json`)).default;
  return createTranslator({ locale, messages: { [namespace]: messages }, namespace }) as unknown as Translator;
}
