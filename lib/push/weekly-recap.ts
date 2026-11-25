import "server-only";

import { Type, type Schema } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import { generateAi } from "@/lib/ai/llm";
import { languageRule } from "@/lib/ai/prompt";
import type { AiUsage } from "@/lib/ai/usage";
import { sendPushToUser } from "@/lib/push/send";
import { staticTranslator } from "@/lib/static-translator";
import type { Locale } from "../../i18n/config.ts";
import {
  computeWeeklyStats,
  deterministicWeeklyRecap,
  shiftIsoDate,
  weeklyPushBody,
  type WeekRange,
  type WeeklyActivity,
  type WeeklyPlanned,
  type WeeklyStats,
} from "@/lib/push/weekly-stats";

export type WeeklyRecapOutcome = "sent" | "exists" | "empty";

// The cron processes users one after another: a slow AI call must not eat the
// others' budget, so past this limit the fixed text is used.
const AI_TIMEOUT_MS = 45_000;

const recapSchema: Schema = {
  type: Type.OBJECT,
  properties: { reply: { type: Type.STRING } },
  required: ["reply"],
};
const RecapResponse = z.object({ reply: z.string().trim().min(1).max(2000) });

function buildRecapPrompt(context: string, stats: WeeklyStats, locale: Locale): string {
  return `Sei il coach di corsa dell'atleta. Scrivi il riepilogo della settimana appena conclusa (dal ${stats.week_start} al ${stats.week_end}).

Regole:
- 3-4 frasi in italiano, seconda persona, tono da coach diretto e incoraggiante.
- Usa solo i numeri di "Numeri della settimana": non inventarne altri.
- Commenta volume, costanza rispetto al piano e uscita più lunga.
- Chiudi con il focus della settimana che inizia, coerente con il piano in arrivo nel contesto.
- Niente elenchi, titoli o markdown.
${languageRule(locale) ? `${languageRule(locale)}\n` : ""}
Numeri della settimana (calcolati, affidabili):
${JSON.stringify({
  km_corsa: stats.running_km,
  attivita: stats.activities,
  sedute_pianificate: stats.planned,
  sedute_pianificate_svolte: stats.planned_done,
  corsa_piu_lunga_km: stats.longest_run_km,
})}

Contesto atleta (JSON):
${context}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function aiRecap(admin: SupabaseClient, userId: string, stats: WeeklyStats, locale: Locale): Promise<{ reply: string; usage: AiUsage } | null> {
  try {
    // A recap is an analysis: use the model chosen for analyses.
    const ai = await getAiConfig(userId, "analysis");
    if (!ai) return null;
    const context = serializeAiContext(await buildAiContext(admin, userId, "chat"));
    const { data: raw, usage } = await withTimeout(
      generateAi<unknown>(buildRecapPrompt(context, stats, locale), recapSchema, ai, "weekly_recap"),
      AI_TIMEOUT_MS,
    );
    return { reply: RecapResponse.parse(raw).reply, usage };
  } catch (error) {
    console.error("weekly recap AI:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Weekly recap for one user: coach message + notification, both in the user's language. */
export async function runWeeklyRecap(
  admin: SupabaseClient,
  userId: string,
  week: WeekRange,
  options: { allowAi: boolean; locale?: Locale },
): Promise<{ outcome: WeeklyRecapOutcome; delivered: number }> {
  const { data: existing, error: existingError } = await admin
    .from("coach_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("metadata->>type", "weekly_recap")
    .eq("metadata->>week_start", week.start)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingError) throw existingError;
  if (existing) return { outcome: "exists", delivered: 0 };

  // One day of margin per side: the exact Rome-date filter is in computeWeeklyStats.
  const [activitiesRes, plannedRes] = await Promise.all([
    admin
      .from("activities")
      .select("started_at, sport, distance_m")
      .eq("user_id", userId)
      .is("excluded_at", null)
      .gte("started_at", `${shiftIsoDate(week.start, -1)}T00:00:00Z`)
      .lt("started_at", `${shiftIsoDate(week.end, 2)}T00:00:00Z`)
      .returns<WeeklyActivity[]>(),
    admin
      .from("planned_workouts")
      .select("date, type")
      .eq("user_id", userId)
      .neq("status", "skipped")
      .gte("date", week.start)
      .lte("date", week.end)
      .returns<WeeklyPlanned[]>(),
  ]);
  if (activitiesRes.error ?? plannedRes.error) throw activitiesRes.error ?? plannedRes.error;

  const stats = computeWeeklyStats(week, activitiesRes.data ?? [], plannedRes.data ?? []);
  if (stats.activities === 0 && stats.planned === 0) return { outcome: "empty", delivered: 0 };

  const locale = options.locale ?? "it";
  const t = await staticTranslator(locale, "push");
  const recap = options.allowAi ? await aiRecap(admin, userId, stats, locale) : null;
  const { error: insertError } = await admin.from("coach_messages").insert({
    user_id: userId,
    role: "assistant",
    kind: "chat",
    content: recap?.reply ?? deterministicWeeklyRecap(stats, t, locale),
    metadata: { type: "weekly_recap", week_start: week.start, ...(recap ? { ai_usage: recap.usage } : {}) },
  });
  if (insertError) throw insertError;

  const delivered = await sendPushToUser(userId, {
    title: t("weekly.title"),
    body: weeklyPushBody(stats, t, locale),
    url: "/",
    tag: `weekly-${week.start}`,
  });
  return { outcome: "sent", delivered };
}
