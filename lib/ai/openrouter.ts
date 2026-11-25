// OpenRouter client (OpenAI-compatible API) for the coach's structured
// output. Schemas are written in Gemini format (lib/ai/prompt.ts): here they are
// converted to JSON Schema. Not all models honor response_format,
// so the schema also goes in the prompt and the response is extracted tolerantly;
// the real validation stays in the callers' zod parsers.
import "server-only";

import type { Schema } from "@google/genai";
import { extractJson as parseJson, toJsonSchema } from "./json-schema.ts";
import type { OpenRouterModel } from "./openrouter-models.ts";
import { openRouterUsage, type AiUsage } from "./usage.ts";
import { openRouterMessages, type Prompt } from "./prompt-cache.ts";

export type { OpenRouterModel } from "./openrouter-models.ts";
export { suggestedOpenRouterModels } from "./openrouter-models.ts";

const API = "https://openrouter.ai/api/v1";
const DEADLINE_MS = 180_000;
const MAX_ATTEMPTS = 3;
/** A retry makes sense only if at least this much time remains. */
const MIN_ATTEMPT_MS = 45_000;
/** Cap on response tokens: the coach's JSON with a whole plan is well below it. */
const MAX_OUTPUT_TOKENS = 24_000;

export class OpenRouterError extends Error {
  /** Tokens and cost of a response that arrived but is invalid (you pay anyway). */
  usage?: AiUsage;
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OpenRouterError";
  }
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Optional attribution in OpenRouter statistics.
    "X-Title": "Zitto e Corri",
  };
}

async function errorFrom(response: Response): Promise<OpenRouterError> {
  let message = `OpenRouter ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) message = body.error.message;
  } catch {
    // non-JSON body
  }
  return new OpenRouterError(message, response.status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/**
 * Reads the streamed response (SSE): slow models (e.g. Opus) write
 * for minutes, and a continuous stream keeps the connection from being closed
 * while the model works. Returns the full text and the token usage.
 */
async function readStream(response: Response): Promise<{ content: string; usage?: ChatUsage }> {
  if (!response.body) throw new OpenRouterError("Risposta vuota dal modello", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ChatUsage | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      // The ": OPENROUTER PROCESSING" lines are only keep-alives.
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let chunk: {
        choices?: Array<{ delta?: { content?: string | null } }>;
        error?: { message?: string; code?: number };
        usage?: ChatUsage;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new OpenRouterError(chunk.error.message ?? "Errore OpenRouter", chunk.error.code ?? 502);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) content += delta;
      if (chunk.usage) usage = chunk.usage;
    }
    if (done) break;
  }
  return { content, usage };
}

/** Signal timeout, even when fetch wraps it in another error. */
function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause != null && cause !== error && isTimeout(cause);
}

/** Catalog price list to estimate or split the cost; null if unknown. */
async function catalogPrice(model: string) {
  const entry = (await listOpenRouterModels()).find((m) => m.id === model);
  return entry && entry.prompt_per_m != null && entry.completion_per_m != null
    ? { input: entry.prompt_per_m, output: entry.completion_per_m }
    : null;
}

/**
 * Structured output `T` from an OpenRouter model, with tokens and cost. The cost
 * is the amount charged (`usage.cost`, always present in responses).
 */
export async function generateOpenRouter<T>(
  prompt: Prompt,
  schema: Schema,
  opts: { apiKey: string; model: string; /** Instant (ms) by which to finish; default 3 minutes from now. */ deadlineAt?: number },
): Promise<{ data: T; usage: AiUsage }> {
  const jsonSchema = toJsonSchema(schema);
  const catalog = (await listOpenRouterModels().catch(() => [])).find((m) => m.id === opts.model);
  const maxTokens = catalog?.max_output ? Math.min(MAX_OUTPUT_TOKENS, catalog.max_output) : null;
  const body = {
    model: opts.model,
    stream: true,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    // With Claude the fixed part carries cache_control (lib/ai/prompt-cache.ts).
    messages: openRouterMessages(
      prompt,
      `Rispondi esclusivamente con un oggetto JSON valido, senza testo prima o dopo, conforme a questo JSON Schema:\n${JSON.stringify(jsonSchema)}`,
      opts.model,
    ),
    response_format: {
      type: "json_schema",
      json_schema: { name: "risposta", strict: false, schema: jsonSchema },
    },
  };
  const deadline = opts.deadlineAt ?? Date.now() + DEADLINE_MS;
  let lastError: unknown;
  // Some providers reject the schema (400): retry without response_format,
  // with the schema only in the prompt.
  let withFormat = true;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || (attempt > 0 && remaining < MIN_ATTEMPT_MS)) break;
    try {
      const payload = withFormat ? body : { ...body, response_format: undefined };
      const response = await fetch(`${API}/chat/completions`, {
        method: "POST",
        headers: headers(opts.apiKey),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(remaining),
        cache: "no-store",
      });
      if (!response.ok) throw await errorFrom(response);
      const data = await readStream(response);
      const content = data.content;
      if (!content.trim()) throw new OpenRouterError("Risposta vuota dal modello", 502);
      const price = await catalogPrice(opts.model).catch(() => null);
      const usage = openRouterUsage(opts.model, data.usage, price);
      let parsed: T;
      try {
        parsed = parseJson(content) as T;
      } catch {
        const invalid = new OpenRouterError("Risposta del modello non in formato JSON", 422);
        invalid.usage = usage;
        throw invalid;
      }
      return { data: parsed, usage };
    } catch (caught) {
      // Time expired: the model is too slow for the available time.
      const error = isTimeout(caught)
        ? new OpenRouterError("Il modello non ha finito in tempo", 504)
        : caught;
      lastError = error;
      if (isTimeout(caught)) break;
      const status = error instanceof OpenRouterError ? error.status : 0;
      if (status === 400 && withFormat) {
        withFormat = false;
        continue;
      }
      // Wrong key, credit or model: retrying is pointless. An invalid response
      // (422) is retried by lib/ai/llm.ts, which records its cost.
      if ([400, 401, 402, 403, 404, 422].includes(status)) throw error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1_500 * (attempt + 1));
    }
  }
  throw lastError ?? new OpenRouterError("Richiesta OpenRouter scaduta", 504);
}

/** Checks the key without spending credit. */
export async function verifyOpenRouterKey(apiKey: string): Promise<void> {
  const response = await fetch(`${API}/key`, { headers: headers(apiKey), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw await errorFrom(response);
}

/**
 * Models that support structured output, from OpenRouter's public
 * catalog (cached for a day). Empty if the catalog does not respond: in
 * settings the model id can always be typed by hand.
 */
export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch(`${API}/models`, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const perMillion = (value: unknown) => {
      const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
      return Number.isFinite(n) ? Math.round(n * 1_000_000 * 100) / 100 : null;
    };
    return (data.data ?? [])
      .filter((model) => {
        const params = model.supported_parameters;
        const list = Array.isArray(params) ? params : typeof params === "string" ? params.split(/[|,]/) : [];
        return list.includes("structured_outputs") || list.includes("response_format");
      })
      .map((model) => {
        const pricing = (model.pricing ?? {}) as Record<string, unknown>;
        return {
          id: String(model.id),
          name: String(model.name ?? model.id),
          prompt_per_m: perMillion(pricing.prompt),
          completion_per_m: perMillion(pricing.completion),
          context: typeof model.context_length === "number" ? model.context_length : null,
          created: typeof model.created === "number" ? model.created : null,
          max_output: typeof (model.top_provider as { max_completion_tokens?: unknown } | undefined)?.max_completion_tokens === "number"
            ? (model.top_provider as { max_completion_tokens: number }).max_completion_tokens
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
