// Traduttore italiano del namespace "labels" per i test dei moduli di lib/
// che ricevono `t` (stesso risultato di getTranslations("labels") in italiano).
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import type { Translator } from "../i18n/config.ts";

const messages = JSON.parse(readFileSync(new URL("../messages/it/labels.json", import.meta.url), "utf8"));

export const itLabels = createTranslator({ locale: "it", messages: { labels: messages }, namespace: "labels" }) as unknown as Translator;
