// Provider e modello per compito: la chat del coach e l'analisi delle corse
// possono usare modelli diversi (es. uno più bravo in chat, uno economico per
// le analisi). Per ogni compito si ricorda anche il modello scelto per l'altro
// provider, così lo switch in chat non perde la scelta. Modulo puro.

import { normalizeGeminiModel } from "./models.ts";

export type AiProvider = "gemini" | "openrouter";

export const AI_TASKS = ["chat", "analysis"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_TASK_LABELS: Record<AiTask, string> = {
  chat: "Chat del coach",
  analysis: "Analisi delle corse",
};

export interface TaskRoute {
  provider: AiProvider;
  /** Modello Gemini per questo compito; null = quello della chiave. */
  gemini: string | null;
  /** Modello OpenRouter per questo compito; null = quello salvato con la chiave. */
  openrouter: string | null;
}

export type AiRouting = Record<AiTask, TaskRoute>;

const isProvider = (value: unknown): value is AiProvider => value === "gemini" || value === "openrouter";
const modelOrNull = (value: unknown) => (typeof value === "string" && value.trim() && value.length <= 120 ? value.trim() : null);

/** Legge `profiles.ai_routing`; i compiti mancanti usano il provider scelto prima (ai_provider). */
export function parseRouting(raw: unknown, legacyProvider: AiProvider): AiRouting {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const route = (task: AiTask): TaskRoute => {
    const value = source[task] && typeof source[task] === "object" ? (source[task] as Record<string, unknown>) : {};
    return {
      provider: isProvider(value.provider) ? value.provider : legacyProvider,
      gemini: modelOrNull(value.gemini),
      openrouter: modelOrNull(value.openrouter),
    };
  };
  return { chat: route("chat"), analysis: route("analysis") };
}

export function withRoute(routing: AiRouting, task: AiTask, patch: Partial<TaskRoute>): AiRouting {
  return { ...routing, [task]: { ...routing[task], ...patch } };
}

export interface ProviderAvailability {
  /** Chiave Gemini salvata e modello predefinito della chiave. */
  gemini: { configured: boolean; model: string | null };
  /** Chiave OpenRouter salvata e modello salvato con la chiave (può mancare). */
  openrouter: { configured: boolean; model: string | null };
}

/** Modello che il compito userebbe con quel provider, o null se non utilizzabile. */
export function taskModel(route: TaskRoute, provider: AiProvider, available: ProviderAvailability): string | null {
  if (provider === "gemini") {
    return available.gemini.configured ? normalizeGeminiModel(route.gemini ?? available.gemini.model) : null;
  }
  return available.openrouter.configured ? route.openrouter ?? available.openrouter.model : null;
}

/**
 * Provider e modello effettivi del compito: quello scelto se pronto, altrimenti
 * l'altro (meglio una risposta con l'altro provider che nessuna). Null se
 * nessuno dei due è configurato.
 */
export function resolveTask(route: TaskRoute, available: ProviderAvailability): { provider: AiProvider; model: string } | null {
  const other: AiProvider = route.provider === "gemini" ? "openrouter" : "gemini";
  for (const provider of [route.provider, other]) {
    const model = taskModel(route, provider, available);
    if (model) return { provider, model };
  }
  return null;
}
