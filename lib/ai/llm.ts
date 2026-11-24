// Punto unico per l'output strutturato del coach: Gemini o OpenRouter secondo
// il compito (lib/ai/credentials.ts → getAiConfig). Ogni chiamata restituisce
// token e costo e finisce nel totale del mese (ai_usage_events, migrazione 0024).
import "server-only";

import type { Schema } from "@google/genai";
import { geminiErrorKey, generateStructured as generateGemini } from "@/lib/ai/gemini";
import { generateOpenRouter, OpenRouterError } from "@/lib/ai/openrouter";
import type { AiConfig } from "@/lib/ai/credentials";
import { sumUsage, type AiUsage } from "@/lib/ai/usage";
import { InvalidAiResponseError, isInvalidResponse, shouldRetryAi, withAiRetry } from "@/lib/ai/retry";
import type { Prompt } from "@/lib/ai/prompt-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Translator } from "@/i18n/config";

/** A cosa serve la chiamata, per il dettaglio dei costi. */
export type AiPurpose = "coach" | "evaluation" | "interval_structure" | "weekly_recap";

export interface AiResult<T> {
  data: T;
  /** Somma di tutti i tentativi, compresi quelli scartati. */
  usage: AiUsage;
  attempts?: number;
}

/** Come i client (lib/ai/gemini.ts, lib/ai/openrouter.ts): 3 minuti in tutto. */
const DEFAULT_DEADLINE_MS = 180_000;

export interface GenerateOptions<T> {
  /** Valida e trasforma la risposta (es. zod): se lancia, la risposta non è valida e si riprova. */
  parse?: (raw: unknown) => T;
  /** Tentativi in tutto (default 2: un nuovo tentativo). */
  maxAttempts?: number;
}

/** Token e costo già spesi in un tentativo fallito, se il provider li ha restituiti. */
function failedUsage(error: unknown): AiUsage | null {
  const usage = (error as { usage?: unknown } | null)?.usage;
  return usage && typeof usage === "object" && "provider" in usage ? (usage as AiUsage) : null;
}

export async function generateAi<T>(
  prompt: Prompt,
  schema: Schema,
  config: AiConfig,
  purpose: AiPurpose,
  /** Istante (ms) entro cui la risposta deve arrivare; default 3 minuti da ora. */
  deadlineAt?: number,
  options: GenerateOptions<T> = {},
): Promise<AiResult<T>> {
  // Una sola scadenza per tutti i tentativi: insieme restano sotto il maxDuration della funzione.
  deadlineAt ??= Date.now() + DEFAULT_DEADLINE_MS;
  const spent: AiUsage[] = [];
  const result = await withAiRetry(async () => {
    const reply = config.provider === "openrouter"
      ? await generateOpenRouter<unknown>(prompt, schema, { apiKey: config.apiKey, model: config.model, deadlineAt })
      : await generateGemini<unknown>(prompt, schema, { apiKey: config.apiKey, model: config.model, deadlineAt });
    let data: T;
    try {
      data = options.parse ? options.parse(reply.data) : (reply.data as T);
    } catch (error) {
      throw new InvalidAiResponseError(
        `Risposta del modello con una struttura non valida: ${error instanceof Error ? error.message.slice(0, 300) : "errore"}`,
        reply.usage,
      );
    }
    await recordAiUsage(config, purpose, reply.usage, false);
    return { data, usage: reply.usage };
  }, {
    maxAttempts: options.maxAttempts,
    deadlineAt,
    // OpenRouter riprova già da sé errori di rete, 5xx e 429: qui solo le risposte non valide.
    retryable: config.provider === "openrouter" ? isInvalidResponse : shouldRetryAi,
    onFailure: async (error, attempt) => {
      const usage = failedUsage(error);
      if (usage) spent.push(usage);
      console.error(`generateAi ${purpose} tentativo ${attempt}:`, error instanceof Error ? error.message : error);
      await recordAiUsage(config, purpose, usage ?? emptyUsage(config), true);
    },
  });
  return {
    data: result.data,
    usage: sumUsage([...spent, result.usage]) ?? result.usage,
    attempts: spent.length + 1,
  };
}

/** Chiamata fallita senza dati d'uso dal provider (errore HTTP, rete): nessun addebito noto. */
function emptyUsage(config: AiConfig): AiUsage {
  return {
    provider: config.provider,
    model: config.model,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    estimated: false,
  };
}

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

/**
 * Mai bloccante: senza la migrazione 0024 il costo resta solo sul messaggio;
 * senza la 0030 si salva senza `failed` e `cache_write_tokens`.
 */
async function recordAiUsage(config: AiConfig, purpose: AiPurpose, usage: AiUsage, failed: boolean) {
  try {
    const row = {
      user_id: config.userId,
      task: config.task,
      purpose,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cached_tokens: usage.cached_tokens ?? 0,
      reasoning_tokens: usage.reasoning_tokens ?? 0,
      cost_usd: usage.cost_usd,
      estimated: usage.estimated,
    };
    const admin = createAdminClient();
    let { error } = await admin.from("ai_usage_events").insert({ ...row, failed, cache_write_tokens: usage.cache_write_tokens ?? 0 });
    if (error && MISSING_COLUMN.has(error.code)) ({ error } = await admin.from("ai_usage_events").insert(row));
    if (error && !MISSING_TABLE.has(error.code)) console.error("recordAiUsage:", error.message);
  } catch (error) {
    console.error("recordAiUsage:", error instanceof Error ? error.message : error);
  }
}

/** Chiave del messaggio d'errore per l'utente (namespace "status", ai.<chiave>), con il provider giusto. */
export function aiErrorKey(error: unknown): string {
  if (error instanceof OpenRouterError) {
    if (error.status === 401 || error.status === 403) return "openrouterInvalidKey";
    if (error.status === 402) return "openrouterNoCredit";
    if (error.status === 404) return "openrouterModelUnavailable";
    if (error.status === 429) return "openrouterRateLimit";
    if (error.status === 422) return "openrouterBadFormat";
    if (error.status === 504) return "openrouterTimeout";
    return "openrouterFailed";
  }
  if (isInvalidResponse(error)) return "invalidResponse";
  return geminiErrorKey(error);
}

/** Messaggio d'errore per l'utente. `t` è legato al namespace "status". */
export function aiErrorMessage(error: unknown, t: Translator): string {
  return t(`ai.${aiErrorKey(error)}`);
}
