// Punto unico per l'output strutturato del coach: Gemini o OpenRouter secondo
// il compito (lib/ai/credentials.ts → getAiConfig). Ogni chiamata restituisce
// token e costo e finisce nel totale del mese (ai_usage_events, migrazione 0024).
import "server-only";

import type { Schema } from "@google/genai";
import { aiErrorMessage as geminiErrorMessage, generateStructured as generateGemini } from "@/lib/ai/gemini";
import { generateOpenRouter, OpenRouterError } from "@/lib/ai/openrouter";
import type { AiConfig } from "@/lib/ai/credentials";
import type { AiUsage } from "@/lib/ai/usage";
import { createAdminClient } from "@/lib/supabase/admin";

/** A cosa serve la chiamata, per il dettaglio dei costi. */
export type AiPurpose = "coach" | "evaluation" | "interval_structure" | "weekly_recap";

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

export async function generateAi<T>(prompt: string, schema: Schema, config: AiConfig, purpose: AiPurpose): Promise<AiResult<T>> {
  const result = config.provider === "openrouter"
    ? await generateOpenRouter<T>(prompt, schema, { apiKey: config.apiKey, model: config.model })
    : await generateGemini<T>(prompt, schema, { apiKey: config.apiKey, model: config.model });
  await recordAiUsage(config, purpose, result.usage);
  return result;
}

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

/** Mai bloccante: senza la migrazione 0024 il costo resta solo sul messaggio. */
async function recordAiUsage(config: AiConfig, purpose: AiPurpose, usage: AiUsage) {
  try {
    const { error } = await createAdminClient().from("ai_usage_events").insert({
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
    });
    if (error && !MISSING_TABLE.has(error.code)) console.error("recordAiUsage:", error.message);
  } catch (error) {
    console.error("recordAiUsage:", error instanceof Error ? error.message : error);
  }
}

/** Messaggio d'errore per l'utente, con il provider giusto. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof OpenRouterError) {
    if (error.status === 401 || error.status === 403) return "Chiave OpenRouter non valida: controllala nelle impostazioni.";
    if (error.status === 402) return "Credito OpenRouter esaurito: ricarica il credito o passa a Gemini.";
    if (error.status === 404) return "Modello OpenRouter non disponibile: scegline un altro nelle impostazioni.";
    if (error.status === 429) return "Troppe richieste a OpenRouter: riprova tra poco o cambia modello.";
    if (error.status === 422) return "Il modello OpenRouter non ha risposto nel formato atteso: prova un altro modello.";
    return "Richiesta a OpenRouter non riuscita. Riprova tra poco.";
  }
  return geminiErrorMessage(error);
}
