// Single entry point for the coach's structured output: Gemini or OpenRouter depending on
// the task (lib/ai/credentials.ts → getAiConfig). Every call returns
// tokens and cost and ends up in the month total (ai_usage_events, migration 0024).
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

/** What the call is for, for the cost breakdown. */
export type AiPurpose = "coach" | "evaluation" | "interval_structure" | "weekly_recap";

export interface AiResult<T> {
  data: T;
  /** Sum of all attempts, including the discarded ones. */
  usage: AiUsage;
  attempts?: number;
}

/** Like the clients (lib/ai/gemini.ts, lib/ai/openrouter.ts): 3 minutes in total. */
const DEFAULT_DEADLINE_MS = 180_000;

export interface GenerateOptions<T> {
  /** Validates and transforms the response (e.g. zod): if it throws, the response is invalid and it retries. */
  parse?: (raw: unknown) => T;
  /** Attempts in total (default 2: one retry). */
  maxAttempts?: number;
}

/** Tokens and cost already spent in a failed attempt, if the provider returned them. */
function failedUsage(error: unknown): AiUsage | null {
  const usage = (error as { usage?: unknown } | null)?.usage;
  return usage && typeof usage === "object" && "provider" in usage ? (usage as AiUsage) : null;
}

export async function generateAi<T>(
  prompt: Prompt,
  schema: Schema,
  config: AiConfig,
  purpose: AiPurpose,
  /** Instant (ms) by which the response must arrive; default 3 minutes from now. */
  deadlineAt?: number,
  options: GenerateOptions<T> = {},
): Promise<AiResult<T>> {
  // A single deadline for all attempts: together they stay under the function's maxDuration.
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
    // OpenRouter already retries network errors, 5xx and 429 by itself: here only invalid responses.
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

/** Call failed without usage data from the provider (HTTP error, network): no known charge. */
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
 * Never blocking: without migration 0024 the cost stays only on the message;
 * without 0030 it is saved without `failed` and `cache_write_tokens`.
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

/** User error message key (namespace "status", ai.<key>), with the right provider. */
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

/** User error message. `t` is bound to the "status" namespace. */
export function aiErrorMessage(error: unknown, t: Translator): string {
  return t(`ai.${aiErrorKey(error)}`);
}
