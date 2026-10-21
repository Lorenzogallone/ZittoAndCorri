// Client OpenRouter (API compatibile OpenAI) per l'output strutturato del
// coach. Gli schemi sono scritti nel formato Gemini (lib/ai/prompt.ts): qui si
// convertono in JSON Schema. Non tutti i modelli rispettano response_format,
// quindi lo schema va anche nel prompt e la risposta si estrae con tolleranza;
// la validazione vera resta nei parser zod dei chiamanti.
import "server-only";

import type { Schema } from "@google/genai";
import { extractJson as parseJson, toJsonSchema } from "./json-schema.ts";

const API = "https://openrouter.ai/api/v1";
const DEADLINE_MS = 180_000;
const MAX_ATTEMPTS = 3;

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

/** Output strutturato `T` da un modello OpenRouter. */
export async function generateOpenRouter<T>(
  prompt: string,
  schema: Schema,
  opts: { apiKey: string; model: string },
): Promise<T> {
  const jsonSchema = toJsonSchema(schema);
  const body = {
    model: opts.model,
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
  const deadline = Date.now() + DEADLINE_MS;
  let lastError: unknown;
  // Alcuni provider rifiutano lo schema (400): si riprova senza response_format,
  // con lo schema solo nel prompt.
  let withFormat = true;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
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
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        error?: { message?: string; code?: number };
      };
      if (data.error) throw new OpenRouterError(data.error.message ?? "Errore OpenRouter", data.error.code ?? 502);
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new OpenRouterError("Risposta vuota dal modello", 502);
      try {
        return parseJson(content) as T;
      } catch {
        throw new OpenRouterError("Risposta del modello non in formato JSON", 422);
      }
    } catch (error) {
      lastError = error;
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

export interface OpenRouterModel {
  id: string;
  name: string;
  /** Prezzo in dollari per milione di token (input, output); 0 = gratis. */
  prompt_per_m: number | null;
  completion_per_m: number | null;
  context: number | null;
  /** Data di uscita (secondi unix), per suggerire i modelli più recenti. */
  created: number | null;
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
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Pochi suggerimenti: il modello più recente di alcune famiglie note, più uno gratuito. */
export function suggestedOpenRouterModels(models: OpenRouterModel[]): OpenRouterModel[] {
  const families = [/^anthropic\/claude/, /^openai\/gpt/, /^google\/gemini/, /^deepseek\//, /:free$/];
  const picks: OpenRouterModel[] = [];
  for (const family of families) {
    const best = models
      .filter((m) => family.test(m.id) && !picks.includes(m) && !/preview|beta|image|audio/i.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
    if (best) picks.push(best);
  }
  return picks;
}
