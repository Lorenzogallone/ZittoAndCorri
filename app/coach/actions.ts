"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiApiKey } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import {
  buildCoachPrompt,
  coachResponseSchema,
  coachResponseSchemaZod,
} from "@/lib/ai/prompt";
import { aiErrorMessage, generateStructured } from "@/lib/ai/gemini";
import { WORKOUT_TYPES, type ProposedWorkout } from "@/lib/types";

export interface CoachActionResult { jobId?: string; error?: string }

function dateShift(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanWorkout(
  workout: ProposedWorkout,
  start: string,
  end: string,
  goalId: string | null,
) {
  const date = workout.date.slice(0, 10);
  if (!isIsoDate(date) || date < start || date > end || !WORKOUT_TYPES.includes(workout.type)) return null;
  const positive = (value: number | null) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const hr = positive(workout.target_hr_bpm);
  return {
    goal_id: goalId,
    date,
    type: workout.type,
    target_distance_m: positive(workout.target_distance_m),
    target_pace_s_km: positive(workout.target_pace_s_km),
    target_duration_s: positive(workout.target_duration_s),
    target_hr_bpm: hr != null && hr >= 80 && hr <= 220 ? hr : null,
    description: workout.description?.trim() || null,
    focus: workout.focus?.trim() || null,
  };
}

export async function sendCoachMessage(message: string): Promise<CoachActionResult> {
  const text = message.trim();
  if (!text) return { error: "Scrivi un messaggio per il coach." };
  if (text.length > 4000) return { error: "Il messaggio è troppo lungo." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apiKey = await getGeminiApiKey(user.id);
  if (!apiKey) return { error: "Configura prima la tua chiave Gemini nelle impostazioni." };

  const { data: userMessage, error: messageError } = await supabase
    .from("coach_messages")
    .insert({ user_id: user.id, role: "user", kind: "chat", content: text })
    .select("id")
    .single<{ id: string }>();
  if (messageError || !userMessage) return { error: "Impossibile salvare il messaggio." };

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({ user_id: user.id, kind: "chat", ref_id: userMessage.id, status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (jobError || !job) return { error: "Impossibile avviare il coach." };

  const userId = user.id;
  after(() => runCoachTurn(job.id, userId, userMessage.id, text, apiKey));
  revalidatePath("/");
  return { jobId: job.id };
}

async function runCoachTurn(
  jobId: string,
  userId: string,
  sourceMessageId: string,
  userText: string,
  apiKey: string,
) {
  const admin = createAdminClient();
  try {
    const context = await buildAiContext(admin, userId, "chat");
    context.conversation.recent_messages = context.conversation.recent_messages
      .filter((message) => message.id !== sourceMessageId);
    const raw = await generateStructured<unknown>(
      buildCoachPrompt(serializeAiContext(context), userText),
      coachResponseSchema,
      { apiKey },
    );
    const result = coachResponseSchemaZod.parse(raw);
    const start = context.meta.today;
    const end = dateShift(start, 13);
    const workouts = result.workouts
      .map((workout) => cleanWorkout(workout, start, end, context.goal?.id ?? null))
      .filter((workout): workout is NonNullable<typeof workout> => workout !== null);

    const { data: assistant, error: assistantError } = await admin
      .from("coach_messages")
      .insert({
        user_id: userId,
        role: "assistant",
        kind: workouts.length ? "plan_proposal" : "chat",
        content: result.reply,
        job_id: jobId,
      })
      .select("id")
      .single<{ id: string }>();
    if (assistantError || !assistant) throw assistantError ?? new Error("Messaggio AI non salvato");

    if (result.memories.length) {
      const activeMemoryIds = new Set(context.memories.map((memory) => memory.id));
      for (const memory of result.memories) {
        const payload = {
          category: memory.category,
          content: memory.content.trim(),
          valid_from: memory.valid_from && isIsoDate(memory.valid_from) ? memory.valid_from : start,
          valid_until: memory.valid_until && isIsoDate(memory.valid_until)
            ? memory.valid_until
            : ["vacation", "weather", "fatigue"].includes(memory.category)
              ? dateShift(start, 7)
              : null,
          source: "chat",
          confidence: memory.confidence,
          source_message_id: sourceMessageId,
          updated_at: new Date().toISOString(),
        };
        const { error } = memory.memory_id && activeMemoryIds.has(memory.memory_id)
          ? await admin.from("coach_memories").update(payload).eq("id", memory.memory_id).eq("user_id", userId)
          : await admin.from("coach_memories").insert({ user_id: userId, ...payload });
        if (error) throw error;
      }
    }

    let proposalId: string | null = null;
    if (workouts.length && result.plan_summary) {
      const { data: base } = await admin
        .from("planned_workouts")
        .select("id, updated_at")
        .eq("user_id", userId)
        .eq("status", "planned")
        .gte("date", start)
        .lte("date", end)
        .order("id")
        .returns<Array<{ id: string; updated_at: string }>>();
      const rows = base ?? [];
      const latest = rows.reduce<string | null>(
        (value, row) => !value || row.updated_at > value ? row.updated_at : value,
        null,
      );
      const { data: proposal, error } = await admin
        .from("plan_proposals")
        .insert({
          user_id: userId,
          source_message_id: sourceMessageId,
          summary: result.plan_summary,
          range_start: start,
          range_end: end,
          workouts,
          base_workout_ids: rows.map((row) => row.id).sort(),
          base_latest_updated_at: latest,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !proposal) throw error ?? new Error("Proposta non salvata");
      proposalId = proposal.id;
      await admin.from("coach_messages").update({ plan_proposal_id: proposal.id }).eq("id", assistant.id);
    }

    await admin.from("coach_state").upsert({
      user_id: userId,
      conversation_summary: result.conversation_summary,
      summarized_through: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await admin.from("ai_jobs").update({
      status: "done",
      output_message_id: assistant.id,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    void proposalId;
  } catch (error) {
    console.error("runCoachTurn:", error);
    await admin.from("ai_jobs").update({
      status: "error",
      error: aiErrorMessage(error),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

export async function applyPlanProposal(proposalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("apply_plan_proposal", { p_proposal_id: proposalId });
  if (error) return { error: "Impossibile applicare la proposta." };
  if (data === "stale") return { error: "Il piano è cambiato: chiedi al coach una nuova proposta." };
  revalidatePath("/");
  revalidatePath("/plan");
  return { ok: true };
}

export async function rejectPlanProposal(proposalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("plan_proposals").update({ status: "rejected" }).eq("id", proposalId).eq("user_id", user.id).eq("status", "pending");
  if (error) return { error: "Impossibile annullare la proposta." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCoachMemory(memoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("coach_memories").delete().eq("id", memoryId).eq("user_id", user.id);
  revalidatePath("/settings");
}

export async function clearCoachHistory(includeMemories: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("plan_proposals").delete().eq("user_id", user.id);
  await supabase.from("coach_messages").delete().eq("user_id", user.id);
  await supabase.from("coach_state").delete().eq("user_id", user.id);
  if (includeMemories) await supabase.from("coach_memories").delete().eq("user_id", user.id);
  revalidatePath("/");
  revalidatePath("/settings");
}
