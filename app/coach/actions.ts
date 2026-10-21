"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig, type AiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import {
  buildCoachPrompt,
  coachResponseSchema,
  coachResponseSchemaZod,
  type CoachResponse,
} from "@/lib/ai/prompt";
import { generalGoalName } from "@/lib/goals";
import { aiErrorMessage, generateAi } from "@/lib/ai/llm";
import { WORKOUT_TYPES, type CoachMessage, type ProposedWorkout } from "@/lib/types";
import { normalizeWorkoutSteps } from "@/lib/workout-steps";
import { insertPlanProposal } from "@/lib/plan/proposals";
import { diffAgainstCalendar } from "@/lib/plan/proposal-calendar";
import { NEW_SESSION } from "@/lib/coach-session";

export interface CoachActionResult { jobId?: string; error?: string; userMessage?: CoachMessage }

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
  const workoutSteps = normalizeWorkoutSteps(workout.workout_steps);
  if (!workoutSteps.length) return null;
  return {
    goal_id: goalId,
    date,
    type: workout.type,
    target_distance_m: positive(workout.target_distance_m),
    target_pace_s_km: positive(workout.target_pace_s_km),
    target_duration_s: positive(workout.target_duration_s),
    target_hr_bpm: hr != null && hr >= 80 && hr <= 220 ? hr : null,
    workout_steps: workoutSteps,
    description: workout.description?.trim() || null,
    focus: workout.focus?.trim() || null,
  };
}

type GoalUpdate = NonNullable<CoachResponse["goal_update"]>;

/**
 * Applica il cambio di obiettivo dichiarato in chat. Ritorna l'id del nuovo
 * obiettivo attivo, null se l'atleta resta senza obiettivo, undefined se
 * l'aggiornamento non è valido e va ignorato.
 */
async function applyGoalUpdate(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  update: GoalUpdate,
  today: string,
): Promise<string | null | undefined> {
  if (update.action === "clear") {
    const { error } = await admin.from("goals").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
    if (error) throw error;
    return null;
  }
  const distance = update.distance_m;
  if (!distance) return undefined;
  const raceDate = update.race_date && isIsoDate(update.race_date) && update.race_date >= today
    ? update.race_date
    : null;
  if (update.race_date && !raceDate) return undefined;
  const values = {
    race_name: update.race_name?.trim() || generalGoalName(distance),
    race_date: raceDate,
    distance_m: distance,
    target_time_s: update.target_time_s,
    is_active: true,
  };
  // Stessa gara già attiva (es. nuovo tempo target): aggiorna invece di duplicare.
  const { data: active } = await admin
    .from("goals")
    .select("id, race_name, race_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle<{ id: string; race_name: string; race_date: string | null }>();
  if (active && active.race_date === values.race_date &&
      (active.race_date || active.race_name.toLowerCase() === values.race_name.toLowerCase())) {
    const { error } = await admin.from("goals").update(values).eq("id", active.id).eq("user_id", userId);
    if (error) throw error;
    return active.id;
  }
  const { error: deactivateError } = await admin.from("goals").update({ is_active: false }).eq("user_id", userId).eq("is_active", true);
  if (deactivateError) throw deactivateError;
  const { data: goal, error } = await admin
    .from("goals")
    .insert({ user_id: userId, ...values })
    .select("id")
    .single<{ id: string }>();
  if (error || !goal) throw error ?? new Error("Obiettivo non salvato");
  return goal.id;
}

/** Finestra in cui il coach può proporre modifiche: 4 settimane da oggi. */
const PROPOSAL_WINDOW_DAYS = 28;

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", timeZone: "UTC" });
}

export async function sendCoachMessage(message: string): Promise<CoachActionResult> {
  const text = message.trim();
  if (!text) return { error: "Scrivi un messaggio per il coach." };
  if (text.length > 4000) return { error: "Il messaggio è troppo lungo." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ai = await getAiConfig(user.id, "chat");
  if (!ai) return { error: "Configura una chiave AI (Gemini o OpenRouter) nelle impostazioni." };

  const { data: userMessage, error: messageError } = await supabase
    .from("coach_messages")
    .insert({ user_id: user.id, role: "user", kind: "chat", content: text })
    .select("*")
    .single<CoachMessage>();
  if (messageError || !userMessage) return { error: "Impossibile salvare il messaggio." };

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({ user_id: user.id, kind: "chat", ref_id: userMessage.id, status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (jobError || !job) return { error: "Impossibile avviare il coach.", userMessage };

  const userId = user.id;
  after(() => runCoachTurn(job.id, userId, userMessage.id, text, ai));
  return { jobId: job.id, userMessage };
}

async function runCoachTurn(
  jobId: string,
  userId: string,
  sourceMessageId: string,
  userText: string,
  ai: AiConfig,
) {
  const admin = createAdminClient();
  try {
    const context = await buildAiContext(admin, userId, "chat");
    context.conversation.recent_messages = context.conversation.recent_messages
      .filter((message) => message.id !== sourceMessageId);
    const { data: raw, usage } = await generateAi<unknown>(
      buildCoachPrompt(serializeAiContext(context), userText),
      coachResponseSchema,
      ai,
      "coach",
    );
    const result = coachResponseSchemaZod.parse(raw);
    const start = context.meta.today;
    const end = dateShift(start, PROPOSAL_WINDOW_DAYS - 1);
    let goalId = context.goal?.id ?? null;
    if (result.goal_update) {
      const updated = await applyGoalUpdate(admin, userId, result.goal_update, start);
      if (updated !== undefined) goalId = updated;
    }
    const proposed = result.workouts
      .map((workout) => cleanWorkout(workout, start, end, goalId))
      .filter((workout): workout is NonNullable<typeof workout> => workout !== null);

    // Solo ciò che cambia davvero, mai giorni passati o già corsi.
    const diff = await diffAgainstCalendar(admin, userId, start, end, proposed, result.remove_dates.filter(isIsoDate));
    const hasProposal = diff.touched.length > 0 && !!result.plan_summary;
    const lockedNote = diff.locked.length
      ? `\n\n_Non ho toccato ${diff.locked.map(dayLabel).join(", ")}: ${diff.locked.length === 1 ? "è un giorno già passato o già corso" : "sono giorni già passati o già corsi"}._`
      : proposed.length && !diff.touched.length
        ? "\n\n_Nessuna modifica da confermare: il piano di quei giorni è già così._"
        : "";

    const { data: assistant, error: assistantError } = await admin
      .from("coach_messages")
      .insert({
        user_id: userId,
        role: "assistant",
        kind: hasProposal ? "plan_proposal" : "chat",
        content: result.reply + lockedNote,
        job_id: jobId,
        // Costo di prompt e risposta, mostrato sotto i due messaggi in chat.
        metadata: { ai_usage: usage, reply_to: sourceMessageId },
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

    if (hasProposal) {
      const proposalId = await insertPlanProposal(admin, {
        userId,
        summary: result.plan_summary!,
        touched: diff.touched,
        workouts: diff.workouts,
        removeDates: diff.removeDates,
        changes: diff.changes,
        sourceMessageId,
      });
      await admin.from("coach_messages").update({ plan_proposal_id: proposalId }).eq("id", assistant.id);
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
  // Solo la funzione giorno per giorno (migrazione 0023): la vecchia cancellava
  // tutte le sedute della finestra, anche quelle non citate o già passate.
  const { data, error } = await supabase.rpc("apply_plan_proposal_v2", { p_proposal_id: proposalId });
  if (error?.code === "PGRST202") {
    return { error: "Per applicare le proposte serve aggiornare il database (migrazione 0023)." };
  }
  if (error) return { error: "Impossibile applicare la proposta." };
  if (data === "stale") return { error: "Il piano di quei giorni è cambiato o sono già passati: chiedi al coach una nuova proposta." };
  if (data !== "applied") return { error: "Proposta non più valida." };
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

export async function rejectPlanProposal(proposalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("plan_proposals").update({ status: "rejected" }).eq("id", proposalId).eq("user_id", user.id).eq("status", "pending");
  if (error) return { error: "Impossibile annullare la proposta." };
  return { ok: true };
}

export async function deleteCoachMemory(memoryId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("coach_memories").delete().eq("id", memoryId).eq("user_id", user.id);
  revalidatePath("/settings");
}

/**
 * "Nuova chat": un segno nella conversazione da cui il coach riparte. Prima
 * resta leggibile in chat ma il coach non la vede più, e il riassunto della
 * conversazione si azzera. Piano, corse e memorie non cambiano.
 */
export async function startNewCoachChat(): Promise<{ marker?: CoachMessage; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: marker, error } = await supabase
    .from("coach_messages")
    .insert({ user_id: user.id, role: "system", kind: "status", content: "Nuova chat", metadata: { type: NEW_SESSION } })
    .select("*")
    .single<CoachMessage>();
  if (error || !marker) return { error: "Impossibile iniziare una nuova chat. Riprova." };
  const { error: stateError } = await supabase.from("coach_state").upsert({
    user_id: user.id,
    conversation_summary: null,
    summarized_through: marker.created_at,
    updated_at: new Date().toISOString(),
  });
  if (stateError) console.error("startNewCoachChat:", stateError.message);
  return { marker };
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
