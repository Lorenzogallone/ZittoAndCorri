// Client OpenRouter (API compatibile OpenAI) per l'output strutturato del
// coach. Gli schemi sono scritti nel formato Gemini (lib/ai/prompt.ts): qui si
// convertono in JSON Schema. Non tutti i modelli rispettano response_format,
// quindi lo schema va anche nel prompt e la risposta si estrae con tolleranza;
// la validazione vera resta nei parser zod dei chiamanti.
import "server-only";

import type { Schema } from "@google/genai";
import { extractJson as parseJson, toJsonSchema } from "./json-schema.ts";
import type { OpenRouterModel } from "./openrouter-models.ts";
import { openRouterUsage, type AiUsage } from "./usage.ts";

export type { OpenRouterModel } from "./openrouter-models.ts";
export { suggestedOpenRouterModels } from "./openrouter-models.ts";

const API = "https://openrouter.ai/api/v1";
const DEADLINE_MS = 180_000;
const MAX_ATTEMPTS = 3;
/** Un nuovo tentativo ha senso solo se resta almeno questo tempo. */
const MIN_ATTEMPT_MS = 45_000;
/** Tetto ai token di risposta: il JSON del coach con un piano intero sta ben sotto. */
const MAX_OUTPUT_TOKENS = 24_000;

export class OpenRouterError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OpenRouterError";
  }
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Attribuzione facoltativa nelle statistiche di OpenRouter.
    "X-Title": "Zitto e Corri",
  };
}

async function errorFrom(response: Response): Promise<OpenRouterError> {
  let message = `OpenRouter ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) message = body.error.message;
  } catch {
    // corpo non JSON
  }
  return new OpenRouterError(message, response.status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/**
 * Legge la risposta in streaming (SSE): i modelli lenti (es. Opus) scrivono
 * per minuti, e un flusso continuo evita che la connessione venga chiusa
 * mentre il modello lavora. Ritorna il testo completo e l'uso dei token.
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
      // Le righe ": OPENROUTER PROCESSING" sono solo keep-alive.
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

/** Scadenza del segnale, anche quando fetch la avvolge in un altro errore. */
function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause != null && cause !== error && isTimeout(cause);
}

/** Listino del catalogo per stimare o dividere il costo; null se non noto. */
async function catalogPrice(model: string) {
  const entry = (await listOpenRouterModels()).find((m) => m.id === model);
  return entry && entry.prompt_per_m != null && entry.completion_per_m != null
    ? { input: entry.prompt_per_m, output: entry.completion_per_m }
    : null;
}

/**
 * Output strutturato `T` da un modello OpenRouter, con token e costo. Il costo
 * è quello addebitato (`usage.cost`, sempre presente nelle risposte).
 */
export async function generateOpenRouter<T>(
  prompt: string,
  schema: Schema,
  opts: { apiKey: string; model: string; /** Istante (ms) entro cui finire; default fra 3 minuti. */ deadlineAt?: number },
): Promise<{ data: T; usage: AiUsage }> {
  const jsonSchema = toJsonSchema(schema);
  const catalog = (await listOpenRouterModels().catch(() => [])).find((m) => m.id === opts.model);
  const maxTokens = catalog?.max_output ? Math.min(MAX_OUTPUT_TOKENS, catalog.max_output) : null;
  const body = {
    model: opts.model,
    stream: true,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages: [
      {
        role: "system",
        content: `Rispondi esclusivamente con un oggetto JSON valido, senza testo prima o dopo, conforme a questo JSON Schema:\n${JSON.stringify(jsonSchema)}`,
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "risposta", strict: false, schema: jsonSchema },
    },
  };
  const deadline = opts.deadlineAt ?? Date.now() + DEADLINE_MS;
  let lastError: unknown;
  // Alcuni provider rifiutano lo schema (400): si riprova senza response_format,
  // con lo schema solo nel prompt.
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
      let parsed: T;
      try {
        parsed = parseJson(content) as T;
      } catch {
        throw new OpenRouterError("Risposta del modello non in formato JSON", 422);
      }
      const price = await catalogPrice(opts.model).catch(() => null);
      return { data: parsed, usage: openRouterUsage(opts.model, data.usage, price) };
    } catch (caught) {
      // Tempo scaduto: il modello è troppo lento per il tempo disponibile.
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
      // Chiave, credito o modello sbagliati: ritentare non serve.
      if ([400, 401, 402, 403, 404].includes(status)) throw error;
      if (attempt < MAX_ATTEMPTS - 1) await sleep(1_500 * (attempt + 1));
    }
  }
  throw lastError ?? new OpenRouterError("Richiesta OpenRouter scaduta", 504);
}

/** Verifica la chiave senza consumare credito. */
export async function verifyOpenRouterKey(apiKey: string): Promise<void> {
  const response = await fetch(`${API}/key`, { headers: headers(apiKey), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw await errorFrom(response);
}

/**
 * Modelli che supportano l'output strutturato, dal catalogo pubblico di
 * OpenRouter (cache di un giorno). Vuoto se il catalogo non risponde: nelle
 * impostazioni si può sempre scrivere l'id del modello a mano.
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
