// Prompt diviso per la cache del provider. La parte fissa (istruzioni e
// metodologia) e quella stabile (dati dell'atleta che cambiano solo con una
// corsa o un piano nuovo) vengono prima; la parte variabile (data e ora,
// conversazione, messaggio nuovo) dopo. Così il prefisso resta identico tra
// un messaggio e l'altro:
// - Claude via OpenRouter: blocchi con cache_control (cache di 5 minuti,
//   scrittura 1,25x, lettura 0,1x o meno del prezzo di input);
// - Gemini, OpenAI e gli altri: cache implicita del prefisso, nessun campo.
// Modulo puro (tests/coach-reliability.test.ts).

export interface PromptParts {
  /** Istruzioni fisse, uguali per ogni messaggio. */
  system: string;
  /** Contesto stabile tra messaggi vicini. */
  stable: string;
  /** Contesto che cambia a ogni messaggio, più il messaggio stesso. */
  variable: string;
}

export type Prompt = string | PromptParts;

export const isPromptParts = (prompt: Prompt): prompt is PromptParts => typeof prompt !== "string";

/** Testo unico, prefisso fisso prima: per Gemini (cache implicita). */
export function promptText(prompt: Prompt): string {
  return isPromptParts(prompt) ? [prompt.system, prompt.stable, prompt.variable].filter(Boolean).join("\n\n") : prompt;
}

/** Modelli che leggono cache_control nei blocchi (Anthropic via OpenRouter). */
export function supportsCacheControl(model: string): boolean {
  return /^anthropic\//i.test(model) || /(^|\/)claude/i.test(model);
}

type TextPart = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export type ChatMessage = { role: "system" | "user"; content: string | TextPart[] };

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * Messaggi per OpenRouter. `preamble` (istruzioni sul formato JSON) apre il
 * messaggio di sistema. Con Claude: due punti di cache, fine del sistema e
 * fine del contesto stabile (massimo 4 per richiesta); se cambia solo il
 * contesto stabile resta in cache almeno il sistema.
 */
export function openRouterMessages(prompt: Prompt, preamble: string, model: string): ChatMessage[] {
  if (!isPromptParts(prompt)) {
    return [{ role: "system", content: preamble }, { role: "user", content: prompt }];
  }
  const system = [preamble, prompt.system].filter(Boolean).join("\n\n");
  if (!supportsCacheControl(model)) {
    return [
      { role: "system", content: system },
      { role: "user", content: [prompt.stable, prompt.variable].filter(Boolean).join("\n\n") },
    ];
  }
  const user: TextPart[] = [];
  if (prompt.stable) user.push({ type: "text", text: prompt.stable, cache_control: EPHEMERAL });
  user.push({ type: "text", text: prompt.variable || "." });
  return [
    { role: "system", content: [{ type: "text", text: system, cache_control: EPHEMERAL }] },
    { role: "user", content: user },
  ];
}

/** Sezioni del contesto che cambiano a ogni messaggio (ora della richiesta, chat). */
export const VARIABLE_CONTEXT_KEYS = ["meta", "conversation", "focus_activity"] as const;

/**
 * Divide il contesto in JSON stabile e JSON variabile, compatti (meno token
 * dell'indentazione). L'unione dei due ha tutte le sezioni.
 */
export function splitContextJson(
  context: Record<string, unknown>,
  variableKeys: readonly string[] = VARIABLE_CONTEXT_KEYS,
): { stable: string; variable: string } {
  const stable: Record<string, unknown> = {};
  const variable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    (variableKeys.includes(key) ? variable : stable)[key] = value;
  }
  return { stable: JSON.stringify(stable), variable: JSON.stringify(variable) };
}
