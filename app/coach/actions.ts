"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { schedulePlanPublish } from "@/lib/intervals/sync";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig, type AiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeCoachContext } from "@/lib/ai/context-envelope";
import {
  buildCoachPrompt,
  coachResponseSchema,
  coachResponseSchemaZod,
  type CoachResponse,
} from "@/lib/ai/prompt";
import { generalGoalName } from "@/lib/goals";
import { aiErrorMessage, generateAi } from "@/lib/ai/llm";
import { DAY_PARTS, WORKOUT_TYPES, type CoachMessage, type PlanProposal, type ProposedWorkout } from "@/lib/types";
import { normalizeWorkoutSteps } from "@/lib/workout-steps";
import { withoutEasyWarmups } from "@/lib/plan/easy-steps";
import { insertPlanProposal } from "@/lib/plan/proposals";
import { diffAgainstCalendar } from "@/lib/plan/proposal-calendar";
import { NEW_SESSION } from "@/lib/coach-session";
import { markSendError } from "@/lib/coach-failures";
import { proposalExpiry, PROPOSAL_EXPIRY_TEXT } from "@/lib/plan/proposal-expiry";
import { discardedPlanNote, workoutDiscardReason, type DiscardReason } from "@/lib/plan/proposal-notes";
import { romeDay } from "@/lib/local-date";

/**
 * Tempo per una risposta del coach, dall'invio del messaggio: la funzione può
 * durare `maxDuration` (300 s, app/page.tsx) e servono ancora una decina di
 * secondi per salvare. I modelli lenti (es. Opus) usano tutto il margine.
 */
const COACH_BUDGET_MS = 270_000;

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
  const workoutSteps = withoutEasyWarmups(workout.type, normalizeWorkoutSteps(workout.workout_steps));
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
    // Ordine nella giornata e legame si normalizzano nel confronto col calendario.
    day_part: workout.day_part && DAY_PARTS.includes(workout.day_part) ? workout.day_part : null,
    chained: workout.chained === true,
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
/** Fino a quanti giorni indietro una seduta non corsa si può togliere (spostata o saltata). */
const REMOVE_LOOKBACK_DAYS = 14;

type ActivityUpdate = CoachResponse["activity_updates"][number];

/**
 * Modifiche alle corse decise in chat: subito applicate perché reversibili
 * dalla pagina della corsa. Solo corse dell'atleta; un id sconosciuto si ignora.
 */
async function applyActivityUpdates(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  updates: ActivityUpdate[],
): Promise<number> {
  let applied = 0;
  for (const update of updates.slice(0, 10)) {
    const patch: Record<string, unknown> = {};
    if (update.action === "exclude") {
      patch.excluded_at = new Date().toISOString();
      patch.excluded_reason = update.reason?.trim() || "Esclusa dal coach";
    } else if (update.action === "restore") {
      patch.excluded_at = null;
      patch.excluded_reason = null;
    }
    if (update.rpe != null) {
      patch.rpe = update.rpe;
      patch.rpe_source = "user";
    }
    if (!Object.keys(patch).length) continue;
    const { data, error } = await admin
      .from("activities")
      .update(patch)
      .eq("id", update.activity_id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      console.error("applyActivityUpdates:", error.message);
      continue;
    }
    if (data) applied += 1;
  }
  return applied;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Invia un messaggio al coach. `clientId` (generato dal telefono) rende
 * l'invio idempotente: se la connessione cade dopo il salvataggio, rimandare
 * lo stesso messaggio riprende quello salvato invece di duplicarlo.
 */
export async function sendCoachMessage(message: string, clientId?: string): Promise<CoachActionResult> {
  const startedAt = Date.now();
  const text = message.trim();
  if (!text) return { error: "Scrivi un messaggio per il coach." };
  if (text.length > 4000) return { error: "Il messaggio è troppo lungo." };
  const client = typeof clientId === "string" && /^[\w-]{8,64}$/.test(clientId) ? clientId : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ai = await getAiConfig(user.id, "chat");
  if (!ai) return { error: "Configura una chiave AI (Gemini o OpenRouter) nelle impostazioni." };

  if (client) {
    const { data: existing } = await supabase
      .from("coach_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "user")
      .eq("metadata->>client_id", client)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) return startCoachTurn(existing.id, startedAt);
  }

  const { data: userMessage, error: messageError } = await supabase
    .from("coach_messages")
    .insert({ user_id: user.id, role: "user", kind: "chat", content: text, metadata: client ? { client_id: client } : {} })
    .select("*")
    .single<CoachMessage>();
  if (messageError || !userMessage) return { error: "Impossibile salvare il messaggio." };
  return queueCoachTurn(user.id, userMessage, ai, startedAt);
}

/**
 * "Riprova" su un messaggio rimasto senza risposta: stesso messaggio, niente
 * duplicati. Torna in fondo alla chat (ora di invio aggiornata) e perde il
 * segno d'errore; se il coach fallisce di nuovo il segno torna.
 */
export async function retryCoachMessage(messageId: string): Promise<CoachActionResult> {
  return startCoachTurn(messageId, Date.now());
}

async function startCoachTurn(messageId: string, startedAt: number): Promise<CoachActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ai = await getAiConfig(user.id, "chat");
  if (!ai) return { error: "Configura una chiave AI (Gemini o OpenRouter) nelle impostazioni." };

  const { data: original } = await supabase
    .from("coach_messages")
    .select("*")
    .eq("id", messageId)
    .eq("user_id", user.id)
    .eq("role", "user")
    .maybeSingle<CoachMessage>();
  if (!original) return { error: "Messaggio non trovato." };

  // Già risposto (es. il primo invio era andato a buon fine): niente doppione.
  const { data: reply } = await supabase
    .from("coach_messages")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .eq("metadata->>reply_to", original.id)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (reply) return { error: "Il coach ha già risposto a questo messaggio: ricarica la chat.", userMessage: original };

  // Un turno ancora in corso per questo messaggio: lo si segue invece di aprirne un altro.
  const { data: running } = await supabase
    .from("ai_jobs")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("kind", "chat")
    .eq("ref_id", original.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; created_at: string }>();
  if (running && Date.now() - Date.parse(running.created_at) < COACH_BUDGET_MS + 30_000) {
    return { jobId: running.id, userMessage: original };
  }

  const { data: userMessage, error } = await supabase
    .from("coach_messages")
    .update({ metadata: markSendError(original.metadata, null), created_at: new Date().toISOString() })
    .eq("id", original.id)
    .eq("user_id", user.id)
    .select("*")
    .single<CoachMessage>();
  if (error || !userMessage) return { error: "Impossibile rimandare il messaggio. Riprova." };
  return queueCoachTurn(user.id, userMessage, ai, startedAt);
}

async function queueCoachTurn(userId: string, userMessage: CoachMessage, ai: AiConfig, startedAt: number): Promise<CoachActionResult> {
  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .insert({ user_id: userId, kind: "chat", ref_id: userMessage.id, status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (jobError || !job) {
    const failed = await markMessageFailed(createAdminClient(), userId, userMessage.id, "Impossibile avviare il coach.");
    return { error: "Impossibile avviare il coach.", userMessage: failed ?? userMessage };
  }
  after(() => runCoachTurn(job.id, userId, userMessage.id, userMessage.content, ai, startedAt + COACH_BUDGET_MS));
  return { jobId: job.id, userMessage };
}

/** Segna il messaggio dell'atleta come non inviato (metadata.send_error). */
async function markMessageFailed(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  messageId: string,
  reason: string,
): Promise<CoachMessage | null> {
  try {
    const { data: current } = await admin
      .from("coach_messages")
      .select("metadata")
      .eq("id", messageId)
      .eq("user_id", userId)
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();
    const { data, error } = await admin
      .from("coach_messages")
      .update({ metadata: markSendError(current?.metadata, { message: reason, at: new Date().toISOString() }) })
      .eq("id", messageId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle<CoachMessage>();
    if (error) console.error("markMessageFailed:", error.message);
    return data ?? null;
  } catch (error) {
    console.error("markMessageFailed:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function runCoachTurn(
  jobId: string,
  userId: string,
  sourceMessageId: string,
  userText: string,
  ai: AiConfig,
  deadlineAt: number,
) {
  const admin = createAdminClient();
  // Dopo il salvataggio della risposta un errore (ricordi, proposta) non rende il messaggio "non inviato".
  let replyId: string | null = null;
  try {
    const context = await buildAiContext(admin, userId, "chat");
    context.conversation.recent_messages = context.conversation.recent_messages
      .filter((message) => message.id !== sourceMessageId);
    // Risposta non valida (JSON o struttura) o errore passeggero: un nuovo
    // tentativo automatico, poi l'errore (lib/ai/llm.ts, lib/ai/retry.ts).
    const { data: parsed, usage } = await generateAi<ParsedCoachResponse>(
      buildCoachPrompt(serializeCoachContext(context), userText),
      coachResponseSchema,
      ai,
      "coach",
      deadlineAt,
      { parse: parseCoachResponse },
    );
    const { result, rawWorkouts, rawRemoveDates } = parsed;
    const start = context.meta.today;
    const end = dateShift(start, PROPOSAL_WINDOW_DAYS - 1);
    let goalId = context.goal?.id ?? null;
    if (result.goal_update) {
      const updated = await applyGoalUpdate(admin, userId, result.goal_update, start);
      if (updated !== undefined) goalId = updated;
    }
    if (result.activity_updates.length) {
      await applyActivityUpdates(admin, userId, result.activity_updates);
      revalidatePath("/activities");
      revalidatePath("/profile");
    }
    // Sedute scartate dalla validazione: dette in chat in una riga, non in silenzio.
    const discarded: DiscardReason[] = Array.from({ length: Math.max(0, rawWorkouts - result.workouts.length) }, () => "invalid" as const);
    const proposed = result.workouts.flatMap((workout) => {
      const cleaned = cleanWorkout(workout, start, end, goalId);
      if (cleaned) return [cleaned];
      discarded.push(workoutDiscardReason(workout, start, end, WORKOUT_TYPES, normalizeWorkoutSteps(workout.workout_steps).length) ?? "no_steps");
      return [];
    });
    const removeDates = result.remove_dates.filter(isIsoDate);
    const discardedNote = discardedPlanNote({ workouts: discarded, removeDates: Math.max(0, rawRemoveDates - removeDates.length) });

    // Solo ciò che cambia davvero, mai giorni passati o già corsi.
    const diff = await diffAgainstCalendar(admin, userId, start, end, proposed, removeDates, REMOVE_LOOKBACK_DAYS);
    // Senza plan_summary la proposta non va persa: riassunto generico.
    const planSummary = result.plan_summary?.trim() || "Modifiche al piano proposte dal coach.";
    const hasProposal = diff.touched.length > 0;
    const lockedNote = diff.locked.length
      ? `\n\n_Non ho toccato ${diff.locked.map(dayLabel).join(", ")}: ${diff.locked.length === 1 ? "è un giorno già corso o troppo indietro" : "sono giorni già corsi o troppo indietro"}._`
      : proposed.length && !diff.touched.length
        ? "\n\n_Nessuna modifica da confermare: il piano di quei giorni è già così._"
        : "";

    const { data: assistant, error: assistantError } = await admin
      .from("coach_messages")
      .insert({
        user_id: userId,
        role: "assistant",
        kind: hasProposal ? "plan_proposal" : "chat",
        content: result.reply + lockedNote + (discardedNote ? `\n\n${discardedNote}` : ""),
        job_id: jobId,
        // Costo di prompt e risposta, mostrato sotto i due messaggi in chat.
        metadata: { ai_usage: usage, reply_to: sourceMessageId },
      })
      .select("id")
      .single<{ id: string }>();
    if (assistantError || !assistant) throw assistantError ?? new Error("Messaggio AI non salvato");
    replyId = assistant.id;

    if (result.memories.length) {
      const activeMemoryIds = new Set(context.memories.map((memory) => memory.id));
      // Un ricordo nuovo uguale a uno già attivo (stesso tipo e testo) non si duplica.
      const sameText = (text: string) => text.toLocaleLowerCase("it-IT").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const known = new Set(context.memories.map((memory) => `${memory.category}|${sameText(memory.content)}`));
      for (const memory of result.memories) {
        if (!(memory.memory_id && activeMemoryIds.has(memory.memory_id))) {
          const key = `${memory.category}|${sameText(memory.content)}`;
          if (known.has(key)) continue;
          known.add(key);
        }
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
        const save = (row: typeof payload) => memory.memory_id && activeMemoryIds.has(memory.memory_id)
          ? admin.from("coach_memories").update(row).eq("id", memory.memory_id).eq("user_id", userId)
          : admin.from("coach_memories").insert({ user_id: userId, ...row });
        let { error } = await save(payload);
        // Database senza la migrazione 0027: la linea guida non va persa,
        // la salva come ricordo di percorso finché la categoria non esiste.
        if (error?.code === "23514" && payload.category === "guideline") {
          ({ error } = await save({ ...payload, category: "long_term", content: `Linea guida: ${payload.content}` }));
        }
        if (error) throw error;
      }
    }

    if (hasProposal) {
      const proposalId = await insertPlanProposal(admin, {
        userId,
        summary: planSummary,
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
    if (replyId) {
      // La risposta c'è già: il job si chiude con quella, il resto si perde senza bloccare la chat.
      await admin.from("ai_jobs").update({
        status: "done",
        output_message_id: replyId,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }
    const message = aiErrorMessage(error);
    // Il messaggio resta in chat come "non inviato" con "Riprova", e fuori
    // dalla storia che il coach rilegge.
    await markMessageFailed(admin, userId, sourceMessageId, message);
    await admin.from("ai_jobs").update({
      status: "error",
      error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

interface ParsedCoachResponse {
  result: CoachResponse;
  /** Elementi nella risposta grezza, per contare quelli scartati dalla validazione. */
  rawWorkouts: number;
  rawRemoveDates: number;
}

function parseCoachResponse(raw: unknown): ParsedCoachResponse {
  const result = coachResponseSchemaZod.parse(raw);
  const value = (raw ?? {}) as { workouts?: unknown; remove_dates?: unknown };
  return {
    result,
    rawWorkouts: Array.isArray(value.workouts) ? value.workouts.length : 0,
    rawRemoveDates: Array.isArray(value.remove_dates) ? value.remove_dates.length : 0,
  };
}

export async function applyPlanProposal(proposalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Proposta scaduta (vecchia, superata o con i giorni già passati): non si applica.
  const { data: proposals } = await supabase
    .from("plan_proposals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<PlanProposal[]>();
  const target = proposals?.find((proposal) => proposal.id === proposalId);
  const expired = target ? proposalExpiry(target, proposals ?? [], romeDay(), Date.now()) : null;
  if (expired) return { error: PROPOSAL_EXPIRY_TEXT[expired] };
  // Solo la funzione giorno per giorno (migrazione 0023): la vecchia cancellava
  // tutte le sedute della finestra, anche quelle non citate o già passate.
  const { data, error } = await supabase.rpc("apply_plan_proposal_v2", { p_proposal_id: proposalId });
  if (error?.code === "PGRST202") {
    return { error: "Per applicare le proposte serve aggiornare il database (migrazione 0023)." };
  }
  if (error) return { error: "Impossibile applicare la proposta." };
  if (data === "stale") return { error: "Il piano di quei giorni è cambiato o sono già passati: chiedi al coach una nuova proposta." };
  if (data !== "applied") return { error: "Proposta non più valida." };
  schedulePlanPublish(user.id);
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
