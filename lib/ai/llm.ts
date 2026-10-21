// Punto unico per l'output strutturato del coach: Gemini o OpenRouter secondo
// la configurazione dell'atleta (lib/ai/credentials.ts → getAiConfig).
import "server-only";

import type { Schema } from "@google/genai";
import { aiErrorMessage as geminiErrorMessage, generateStructured as generateGemini } from "@/lib/ai/gemini";
import { generateOpenRouter, OpenRouterError } from "@/lib/ai/openrouter";
import type { AiConfig } from "@/lib/ai/credentials";

export function generateAi<T>(prompt: string, schema: Schema, config: AiConfig): Promise<T> {
  return config.provider === "openrouter"
    ? generateOpenRouter<T>(prompt, schema, { apiKey: config.apiKey, model: config.model })
    : generateGemini<T>(prompt, schema, { apiKey: config.apiKey, model: config.model });
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
