// Traduttore italiano del namespace "metrics" per chi non ha la lingua
// dell'utente: i testi che finiscono nei prompt del coach restano in italiano
// (il prompt è scritto in italiano) e i test li asseriscono così.
// Nell'interfaccia si passa invece il traduttore della lingua scelta.

import { createTranslator } from "next-intl";
import type { Translator } from "../../i18n/config.ts";
import metrics from "../../messages/it/metrics.json" with { type: "json" };

export const metricsIt = createTranslator({ locale: "it", messages: { metrics }, namespace: "metrics" }) as unknown as Translator;
