// Traduttori italiani sincroni, senza richiesta né cookie: per i testi che
// finiscono nei prompt del coach (restano in italiano) e per i test. Nell'interfaccia
// si usa il traduttore della lingua scelta (useTranslations / getTranslations).

import { createTranslator } from "next-intl";
import type { Translator } from "../i18n/config.ts";
import labels from "../messages/it/labels.json" with { type: "json" };
import metrics from "../messages/it/metrics.json" with { type: "json" };
import status from "../messages/it/status.json" with { type: "json" };

const italian = (namespace: string, messages: object): Translator =>
  createTranslator({ locale: "it", messages: { [namespace]: messages }, namespace }) as unknown as Translator;

export const itLabels = italian("labels", labels);
export const itMetrics = italian("metrics", metrics);
export const itStatus = italian("status", status);
