import "server-only";

import { Type, type Schema } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import { generateAi } from "@/lib/ai/llm";
import { sendPushToUser } from "@/lib/push/send";
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

// Il cron elabora gli utenti in sequenza: una chiamata AI lenta non deve
// consumare il budget degli altri, quindi oltre questo limite si usa il testo fisso.
const AI_TIMEOUT_MS = 45_000;

const recapSchema: Schema = {
  type: Type.OBJECT,
  properties: { reply: { type: Type.STRING } },
  required: ["reply"],
};
const RecapResponse = z.object({ reply: z.string().trim().min(1).max(2000) });

function buildRecapPrompt(context: string, stats: WeeklyStats): string {
  return `Sei il coach di corsa dell'atleta. Scrivi il riepilogo della settimana appena conclusa (dal ${stats.week_start} al ${stats.week_end}).

Regole:
- 3-4 frasi in italiano, seconda persona, tono da coach diretto e incoraggiante.
- Usa solo i numeri di "Numeri della settimana": non inventarne altri.
- Commenta volume, costanza rispetto al piano e uscita più lunga.
- Chiudi con il focus della settimana che inizia, coerente con il piano in arrivo nel contesto.
- Niente elenchi, titoli o markdown.

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

async function aiRecap(admin: SupabaseClient, userId: string, stats: WeeklyStats): Promise<string | null> {
  try {
    const ai = await getAiConfig(userId);
    if (!ai) return null;
    const context = serializeAiContext(await buildAiContext(admin, userId, "chat"));
    const raw = await withTimeout(
      generateAi<unknown>(buildRecapPrompt(context, stats), recapSchema, ai),
      AI_TIMEOUT_MS,
    );
    return RecapResponse.parse(raw).reply;
  } catch (error) {
    console.error("weekly recap AI:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Riepilogo della settimana per un utente: messaggio del coach + notifica. */
export async function runWeeklyRecap(
  admin: SupabaseClient,
  userId: string,
  week: WeekRange,
  options: { allowAi: boolean },
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

  // Margine di un giorno per lato: il filtro preciso per data di Roma è in computeWeeklyStats.
  const [activitiesRes, plannedRes] = await Promise.all([
    admin
      .from("activities")
      .select("started_at, sport, distance_m")
      .eq("user_id", userId)
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

  const content = (options.allowAi ? await aiRecap(admin, userId, stats) : null)
    ?? deterministicWeeklyRecap(stats);
  const { error: insertError } = await admin.from("coach_messages").insert({
    user_id: userId,
    role: "assistant",
    kind: "chat",
    content,
    metadata: { type: "weekly_recap", week_start: week.start },
  });
  if (insertError) throw insertError;

  const delivered = await sendPushToUser(userId, {
    title: "La tua settimana",
    body: weeklyPushBody(stats),
    url: "/",
    tag: `weekly-${week.start}`,
  });
  return { outcome: "sent", delivered };
}
