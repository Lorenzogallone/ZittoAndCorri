import "server-only";

// Stato dei provider AI per l'interfaccia (mai segreti): chiavi configurate e,
// per la chat del coach e per l'analisi delle corse, provider e modello in uso.
// Tollerante se mancano le migrazioni 0023 (OpenRouter) e 0024 (per compito).

import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_MODELS, normalizeGeminiModel } from "@/lib/ai/models";
import { loadAiRouting } from "@/lib/ai/credentials";
import { AI_TASKS, resolveTask, taskModel, type AiProvider, type AiTask, type ProviderAvailability, type TaskRoute } from "@/lib/ai/routing";
import { shortModelName } from "@/lib/ai/usage";

export interface ProviderTaskStatus {
  /** Utilizzabile per il compito: chiave salvata e modello scelto. */
  configured: boolean;
  model: string | null;
  /** Nome breve, es. "3.5 Flash Lite" o "claude-sonnet-5-5". */
  modelLabel: string | null;
}

export interface TaskStatus {
  /** Provider usato davvero (scelto e pronto, altrimenti l'altro). */
  active: AiProvider | null;
  /** Provider scelto nelle impostazioni. */
  provider: AiProvider;
  gemini: ProviderTaskStatus;
  /** Null se il database non ha ancora la migrazione 0023. */
  openrouter: ProviderTaskStatus | null;
}

export interface AiStatus {
  /** Provider della chat: basta a sapere se c'è almeno una chiave. */
  active: AiProvider | null;
  /** False senza la migrazione 0024: un solo provider per tutto. */
  perTask: boolean;
  keys: {
    gemini: { configured: boolean; lastFour: string | null };
    openrouter: { configured: boolean; lastFour: string | null } | null;
  };
  chat: TaskStatus;
  analysis: TaskStatus;
}

const MISSING = new Set(["42703", "42P01", "PGRST205", "PGRST202"]);

export function geminiModelLabel(model: string | null): string {
  const id = normalizeGeminiModel(model);
  return GEMINI_MODELS.find((m) => m.id === id)?.label.replace(/^Gemini /, "") ?? id;
}

/** "openai/gpt-5-mini" → "gpt-5-mini". */
export const openRouterModelLabel = (model: string | null) => (model ? shortModelName(model) : null);

function taskStatus(route: TaskRoute, available: ProviderAvailability, openrouterMigrated: boolean): TaskStatus {
  const geminiModel = taskModel(route, "gemini", available);
  const routerModel = taskModel(route, "openrouter", available);
  return {
    active: resolveTask(route, available)?.provider ?? null,
    provider: route.provider,
    gemini: { configured: !!geminiModel, model: geminiModel, modelLabel: geminiModel ? geminiModelLabel(geminiModel) : null },
    openrouter: openrouterMigrated
      ? { configured: !!routerModel, model: routerModel, modelLabel: openRouterModelLabel(routerModel) }
      : null,
  };
}

export async function getAiStatus(supabase: SupabaseClient, userId: string): Promise<AiStatus> {
  const [gemini, openrouter, { routing, stored }] = await Promise.all([
    supabase.from("user_ai_credentials").select("model, last_four").eq("user_id", userId).maybeSingle<{ model: string | null; last_four: string }>(),
    supabase.from("user_openrouter_credentials").select("model, last_four").eq("user_id", userId).maybeSingle<{ model: string | null; last_four: string }>(),
    loadAiRouting(supabase, userId),
  ]);
  const openrouterMigrated = !(openrouter.error && MISSING.has(openrouter.error.code));
  const available: ProviderAvailability = {
    gemini: { configured: !!gemini.data, model: gemini.data ? normalizeGeminiModel(gemini.data.model) : null },
    openrouter: { configured: openrouterMigrated && !!openrouter.data, model: openrouter.data?.model ?? null },
  };
  const tasks = Object.fromEntries(AI_TASKS.map((task) => [task, taskStatus(routing[task], available, openrouterMigrated)])) as Record<AiTask, TaskStatus>;
  return {
    active: tasks.chat.active,
    perTask: stored,
    keys: {
      gemini: { configured: !!gemini.data, lastFour: gemini.data?.last_four ?? null },
      openrouter: openrouterMigrated ? { configured: !!openrouter.data, lastFour: openrouter.data?.last_four ?? null } : null,
    },
    chat: tasks.chat,
    analysis: tasks.analysis,
  };
}
