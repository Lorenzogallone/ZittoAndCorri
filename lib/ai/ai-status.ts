import "server-only";

// AI provider status for the UI (never secrets): configured keys and,
// for the coach chat and run analysis, the provider and model in use.
// Tolerant of missing migrations 0023 (OpenRouter) and 0024 (per task).

import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_MODELS, normalizeGeminiModel } from "@/lib/ai/models";
import { loadAiRouting } from "@/lib/ai/credentials";
import { AI_TASKS, resolveTask, taskModel, type AiProvider, type AiTask, type ProviderAvailability, type TaskRoute } from "@/lib/ai/routing";
import { shortModelName } from "@/lib/ai/usage";

export interface ProviderTaskStatus {
  /** Usable for the task: key saved and model chosen. */
  configured: boolean;
  model: string | null;
  /** Short name, e.g. "3.5 Flash Lite" or "claude-sonnet-5-5". */
  modelLabel: string | null;
}

export interface TaskStatus {
  /** Provider actually used (the chosen one if ready, otherwise the other). */
  active: AiProvider | null;
  /** Provider chosen in settings. */
  provider: AiProvider;
  gemini: ProviderTaskStatus;
  /** Null if the database does not have migration 0023 yet. */
  openrouter: ProviderTaskStatus | null;
}

export interface AiStatus {
  /** Chat provider: enough to know whether there is at least one key. */
  active: AiProvider | null;
  /** False without migration 0024: a single provider for everything. */
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
