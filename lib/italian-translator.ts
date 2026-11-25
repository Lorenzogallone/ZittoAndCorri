// Synchronous Italian translators, without request or cookies: for texts that
// end up in the coach prompts (they stay in Italian) and for tests. In the interface
// the translator for the chosen language is used (useTranslations / getTranslations).

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
