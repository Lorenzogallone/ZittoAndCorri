// Provider and model per task: the coach chat and the run analysis
// can use different models (e.g. a stronger one in chat, a cheap one for
// the analyses). For each task the model chosen for the other provider is
// also remembered, so switching in chat does not lose the choice. Pure module.

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
  /** Gemini model for this task; null = the key's one. */
  gemini: string | null;
  /** OpenRouter model for this task; null = the one saved with the key. */
  openrouter: string | null;
}

export type AiRouting = Record<AiTask, TaskRoute>;

const isProvider = (value: unknown): value is AiProvider => value === "gemini" || value === "openrouter";
const modelOrNull = (value: unknown) => (typeof value === "string" && value.trim() && value.length <= 120 ? value.trim() : null);

/** Reads `profiles.ai_routing`; missing tasks use the previously chosen provider (ai_provider). */
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
  /** Saved Gemini key and the key's default model. */
  gemini: { configured: boolean; model: string | null };
  /** Saved OpenRouter key and the model saved with the key (may be missing). */
  openrouter: { configured: boolean; model: string | null };
}

/** Model the task would use with that provider, or null if unusable. */
export function taskModel(route: TaskRoute, provider: AiProvider, available: ProviderAvailability): string | null {
  if (provider === "gemini") {
    return available.gemini.configured ? normalizeGeminiModel(route.gemini ?? available.gemini.model) : null;
  }
  return available.openrouter.configured ? route.openrouter ?? available.openrouter.model : null;
}

/**
 * Effective provider and model of the task: the chosen one if ready, otherwise
 * the other (better an answer from the other provider than none). Null if
 * neither is configured.
 */
export function resolveTask(route: TaskRoute, available: ProviderAvailability): { provider: AiProvider; model: string } | null {
  const other: AiProvider = route.provider === "gemini" ? "openrouter" : "gemini";
  for (const provider of [route.provider, other]) {
    const model = taskModel(route, provider, available);
    if (model) return { provider, model };
  }
  return null;
}
