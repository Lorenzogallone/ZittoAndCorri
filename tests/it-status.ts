// Traduttore italiano del namespace "status" per i test dei moduli di lib/
// che ricevono `t` (stesso risultato di getTranslations("status") in italiano).
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import type { Translator } from "../i18n/config.ts";

const messages = JSON.parse(readFileSync(new URL("../messages/it/status.json", import.meta.url), "utf8"));

export const itStatus = createTranslator({ locale: "it", messages: { status: messages }, namespace: "status" }) as unknown as Translator;
