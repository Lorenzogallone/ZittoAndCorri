// Prompt split for the provider cache. The fixed part (instructions and
// methodology) and the stable one (athlete data that changes only with a
// new run or plan) come first; the variable part (date and time,
// conversation, new message) after. This way the prefix stays identical between
// one message and the next:
// - Claude via OpenRouter: blocks with cache_control (5-minute cache,
//   write 1.25x, read 0.1x or less of the input price);
// - Gemini, OpenAI and the others: implicit prefix cache, no field.
// Pure module (tests/coach-reliability.test.ts).

export interface PromptParts {
  /** Fixed instructions, the same for every message. */
  system: string;
  /** Context that is stable across nearby messages. */
  stable: string;
  /** Context that changes with every message, plus the message itself. */
  variable: string;
}

export type Prompt = string | PromptParts;

export const isPromptParts = (prompt: Prompt): prompt is PromptParts => typeof prompt !== "string";

/** Single text, fixed prefix first: for Gemini (implicit cache). */
export function promptText(prompt: Prompt): string {
  return isPromptParts(prompt) ? [prompt.system, prompt.stable, prompt.variable].filter(Boolean).join("\n\n") : prompt;
}

/** Models that read cache_control in blocks (Anthropic via OpenRouter). */
export function supportsCacheControl(model: string): boolean {
  return /^anthropic\//i.test(model) || /(^|\/)claude/i.test(model);
}

type TextPart = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
export type ChatMessage = { role: "system" | "user"; content: string | TextPart[] };

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * Messages for OpenRouter. `preamble` (JSON format instructions) opens the
 * system message. With Claude: two cache points, end of the system and
 * end of the stable context (max 4 per request); if only the stable
 * context changes, at least the system stays cached.
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

/** Context sections that change with every message (request time, chat). */
export const VARIABLE_CONTEXT_KEYS = ["meta", "conversation", "focus_activity"] as const;

/**
 * Splits the context into stable JSON and variable JSON, compact (fewer tokens
 * than indentation). The union of the two has all the sections.
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
