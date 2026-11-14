import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig, type AiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import { activityDetailLine } from "@/lib/ai/context";
import { buildEvaluationPrompt, evaluationResponseSchemaZod, evaluationSchema } from "@/lib/ai/prompt";
import { aiErrorMessage, generateAi } from "@/lib/ai/llm";
import { sumUsage, type AiUsage } from "@/lib/ai/usage";
import { isoDateShift } from "@/lib/dates";
import type { Activity, EvaluationResult, PlannedWorkout, Profile } from "@/lib/types";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { sendPushToUser } from "@/lib/push/send";
import { analysisPushBody } from "@/lib/push/messages";
import { extractDeclaredStructure, mayDescribeStructure } from "@/lib/ai/interval-structure";
import { intervalsUpToDate, isMissingColumn, persistIntervals, type DeclaredIntervals } from "@/lib/derived";
import type { IntervalAnalysis } from "@/lib/metrics/intervals";
import { intervalsForPrompt } from "@/lib/intervals-text";
import type { SupabaseClient } from "@supabase/supabase-js";
import { romeDay } from "@/lib/local-date";
import { sortByDayOrder } from "@/lib/plan/day-sessions";
import { workoutForActivity } from "@/lib/plan/match-activities";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";

type EvalActivity = Pick<Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" |
  "moving_time_s" | "avg_pace_s_km" | "avg_hr" | "max_hr" | "rpe" |
  "rpe_source" | "source_title" | "elevation_gain_m" | "hr_drift_pct" |
  "avg_cadence_spm" | "time_in_zone" | "splits" | "notes"
>;

type SameDayActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "avg_hr">;

/** Seduta pianificata per il prompt, con il suo posto nella giornata. */
function planForPrompt(workout: PlannedWorkout, matchedId: string | null) {
  return {
    date: workout.date,
    type: workout.type,
    target_distance_m: workout.target_distance_m,
    target_pace_s_km: workout.target_pace_s_km,
    target_duration_s: workout.target_duration_s,
    target_hr_bpm: workout.target_hr_bpm,
    description: workout.description,
    focus: workout.focus,
    order: workout.day_order ?? 1,
    part: workout.day_part ?? null,
    chained: workout.chained === true,
    /** Seduta abbinata a questa attività (orario, distanza, durata, ordine). */
    matched: workout.id === matchedId,
  };
}

const romeTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/**
 * Altre attività dello stesso giorno, con la distanza in minuti da questa:
 * un riscaldamento registrato a parte finisce pochi minuti prima della seduta.
 */
function sameDayLines(activity: Pick<Activity, "started_at" | "duration_s">, others: SameDayActivity[]): string | null {
  if (!others.length) return null;
  const start = Date.parse(activity.started_at);
  const end = start + activity.duration_s * 1000;
  return others.map((other) => {
    const otherStart = Date.parse(other.started_at);
    const otherEnd = otherStart + other.duration_s * 1000;
    const gap = otherEnd <= start
      ? `finita ${Math.round((start - otherEnd) / 60_000)} min prima di questa`
      : otherStart >= end
        ? `iniziata ${Math.round((otherStart - end) / 60_000)} min dopo questa`
        : "sovrapposta a questa";
    return JSON.stringify({
      id: other.id,
      start: romeTime(other.started_at),
      when: gap,
      sport: other.sport,
      type: other.type,
      distance_m: other.distance_m,
      duration_s: other.moving_time_s ?? other.duration_s,
      avg_pace_s_km: other.avg_pace_s_km,
      avg_hr: other.avg_hr,
    });
  }).join("\n");
}

export async function enqueueActivityEvaluation(
  userId: string,
  activityId: string,
): Promise<string | null> {
  const ai = await getAiConfig(userId, "analysis");
  if (!ai) return null;
  const admin = createAdminClient();
  const { data: current } = await admin.from("ai_jobs").select("id").eq("user_id", userId).eq("kind", "evaluation").eq("ref_id", activityId).eq("status", "pending").limit(1).maybeSingle<{ id: string }>();
  if (current) return current.id;
  const { data: job, error } = await admin.from("ai_jobs").insert({ user_id: userId, kind: "evaluation", ref_id: activityId, status: "pending" }).select("id").single<{ id: string }>();
  if (error || !job) throw error ?? new Error("Job non creato");
  after(() => runActivityEvaluation(job.id, userId, activityId, ai));
  return job.id;
}

/** Gli import non devono mai fallire dopo che l'attività è stata salvata. */
export async function enqueueActivityEvaluationSafely(
  userId: string,
  activityId: string,
): Promise<string | null> {
  try {
    return await enqueueActivityEvaluation(userId, activityId);
  } catch (error) {
    console.error("enqueueActivityEvaluationSafely:", error);
    return null;
  }
}

/**
 * Tratti della corsa per la valutazione. Una struttura appena letta dalla nota
 * fa ricalcolare tutto; altrimenti si usa l'analisi salvata se è aggiornata.
 */
async function intervalsForEvaluation(
  admin: SupabaseClient,
  userId: string,
  activity: Pick<Activity, "id" | "sport" | "started_at">,
  declared: DeclaredIntervals | undefined,
): Promise<IntervalAnalysis | null> {
  if (activity.sport !== "running") return null;
  if (declared) return persistIntervals(admin, userId, activity, undefined, declared);
  const { data, error } = await admin
    .from("activities")
    .select("intervals")
    .eq("id", activity.id)
    .eq("user_id", userId)
    .maybeSingle<{ intervals: IntervalAnalysis | null }>();
  if (!error && intervalsUpToDate(data?.intervals)) return data!.intervals!;
  if (error && !isMissingColumn(error)) throw error;
  return persistIntervals(admin, userId, activity);
}

async function runActivityEvaluation(
  jobId: string,
  userId: string,
  activityId: string,
  ai: AiConfig,
) {
  const admin = createAdminClient();
  try {
    const [activityResult, profileResult, context] = await Promise.all([
      admin.from("activities").select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr, max_hr, rpe, rpe_source, source_title, elevation_gain_m, hr_drift_pct, avg_cadence_spm, time_in_zone, splits, notes").eq("id", activityId).eq("user_id", userId).maybeSingle<EvalActivity>(),
      admin.from("profiles").select("max_hr, resting_hr").eq("id", userId).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
      buildAiContext(admin, userId, "evaluation", { activityId }),
    ]);
    const { data: activity, error: activityError } = activityResult;
    const { data: profile, error: profileError } = profileResult;
    const inputError = activityError ?? profileError;
    if (inputError) throw inputError;
    if (!activity) throw new Error("Attività non trovata");
    const effectiveHr = await getEffectiveHrConfig(admin, userId, profile ?? null);

    const activityDay = romeDay(activity.started_at);
    const [nearbyPlanResult, existingEvaluationResult, sameDayResult] = await Promise.all([
      // "*": ordine, momento e legame delle sedute esistono solo dalla migrazione 0029.
      admin
        .from("planned_workouts")
        .select("*")
        .eq("user_id", userId)
        .gte("date", isoDateShift(activityDay, -3))
        .lte("date", isoDateShift(activityDay, 3))
        .order("date")
        .returns<PlannedWorkout[]>(),
      admin
        .from("evaluations")
        .select("id, details")
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; details: string[] | null }>(),
      admin
        .from("activities")
        .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr")
        .eq("user_id", userId)
        .is("excluded_at", null)
        .neq("id", activityId)
        .gte("started_at", `${isoDateShift(activityDay, -1)}T12:00:00Z`)
        .lte("started_at", `${isoDateShift(activityDay, 1)}T12:00:00Z`)
        .order("started_at")
        .returns<SameDayActivity[]>(),
    ]);
    const others = (sameDayResult.data ?? []).filter((other) => romeDay(other.started_at) === activityDay);
    // Con più sedute e più corse nello stesso giorno: la seduta che somiglia di più a questa corsa.
    const matched = workoutForActivity(
      activity.id,
      (nearbyPlanResult.data ?? [])
        .filter((workout) => workout.date === activityDay)
        .map((workout) => ({ ...workout, workout_steps: workoutStepsOrLegacy(workout.workout_steps, workout) })),
      [activity, ...others],
    );
    const nearbyPlan = nearbyPlanResult.data
      ? sortByDayOrder(nearbyPlanResult.data).map((workout) => planForPrompt(workout, matched?.id ?? null))
      : null;
    const nearbyPlanError = nearbyPlanResult.error;
    const sameDay = sameDayLines(activity, others);
    const { data: existingEvaluation, error: existingEvaluationError } = existingEvaluationResult;
    if (nearbyPlanError ?? existingEvaluationError) {
      throw nearbyPlanError ?? existingEvaluationError;
    }
    // Struttura scritta nella nota (es. "3 × (3' forte + 1' jog + 1' sprint)"):
    // la legge Gemini, poi i tratti si misurano sul file. Mai bloccante.
    let declared: DeclaredIntervals | undefined;
    let structureUsage: AiUsage | null = null;
    if (activity.sport === "running" && mayDescribeStructure(activity.notes)) {
      const planned = (nearbyPlan ?? []).filter((workout) => workout.matched);
      const hint = planned.length ? planned.map((workout) => [workout.type, workout.description].filter(Boolean).join(": ")).join(" | ") : null;
      try {
        const structure = await extractDeclaredStructure(activity.notes, hint, ai);
        declared = structure.declared ?? undefined;
        structureUsage = structure.usage;
      } catch (structureError) {
        console.error("extractDeclaredStructure:", structureError);
      }
    }
    const intervals = await intervalsForEvaluation(admin, userId, activity, declared).catch((intervalsError) => {
      console.error("intervalsForEvaluation:", intervalsError);
      return null;
    });

    const detail = [
      activity.source_title ? `Titolo dal file: ${activity.source_title}.` : "",
      activityDetailLine(activity, effectiveHr),
      activity.rpe != null ? `Origine RPE: ${activity.rpe_source ?? "non specificata"}.` : "RPE non disponibile.",
      activity.splits?.length ? `Split per km: ${JSON.stringify(activity.splits)}.` : "",
      intervalsForPrompt(intervals) ?? "",
      existingEvaluation?.details?.length
        ? `Dettagli già catalogati da conservare e consolidare: ${JSON.stringify(existingEvaluation.details)}.`
        : "",
    ].filter(Boolean).join("\n");
    const { data: rawResult, usage: evaluationUsage } = await generateAi<unknown>(
      buildEvaluationPrompt(
        serializeAiContext(context),
        detail,
        nearbyPlan?.length ? JSON.stringify(nearbyPlan) : null,
        sameDay,
      ),
      evaluationSchema,
      ai,
      "evaluation",
    );
    const result: EvaluationResult = evaluationResponseSchemaZod.parse(rawResult);
    // Lettura della nota + valutazione: il costo mostrato è quello dell'analisi intera.
    const usage = sumUsage([structureUsage, evaluationUsage]);

    const evaluationPayload = {
      model: ai.model,
      summary: result.summary,
      details: result.details,
      flags: result.flags ?? {},
    };
    const saveEvaluation = (payload: typeof evaluationPayload & { ai_usage?: AiUsage | null }) => existingEvaluation
      ? admin.from("evaluations").update(payload).eq("id", existingEvaluation.id)
      : admin.from("evaluations").insert({ user_id: userId, activity_id: activityId, ...payload });
    let { error: evaluationError } = await saveEvaluation({ ...evaluationPayload, ai_usage: usage });
    // Senza la migrazione 0024 il costo resta solo sul messaggio della chat.
    if (isMissingColumn(evaluationError)) ({ error: evaluationError } = await saveEvaluation(evaluationPayload));
    if (evaluationError) throw evaluationError;

    // Il commento libero è solo materiale di ingresso: una volta trasformato
    // con successo in punti strutturati non deve restare visibile né essere
    // ripetuto nelle valutazioni successive.
    if (activity.notes && result.details.length > 0) {
      const { error: clearNotesError } = await admin
        .from("activities")
        .update({ notes: null })
        .eq("id", activityId)
        .eq("user_id", userId);
      if (clearNotesError) throw clearNotesError;
    }
    const { data: existingMessage, error: existingMessageError } = await admin.from("coach_messages")
      .select("id")
      .eq("user_id", userId)
      .eq("activity_id", activityId)
      .eq("kind", "activity_feedback")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existingMessageError) throw existingMessageError;
    const messagePayload = {
      content: result.summary,
      job_id: jobId,
      metadata: { flags: result.flags ?? {}, details: result.details, ai_usage: usage },
    };
    const messageQuery = existingMessage
      ? admin.from("coach_messages").update(messagePayload).eq("id", existingMessage.id).select("id").single<{ id: string }>()
      : admin.from("coach_messages").insert({
          user_id: userId,
          role: "assistant",
          kind: "activity_feedback",
          activity_id: activityId,
          ...messagePayload,
        }).select("id").single<{ id: string }>();
    const { data: message, error: messageError } = await messageQuery;
    if (messageError || !message) throw messageError ?? new Error("Feedback chat non salvato");
    await admin.from("ai_jobs").update({ status: "done", output_message_id: message.id, updated_at: new Date().toISOString() }).eq("id", jobId);
    // La notifica è un extra: qualunque problema non deve far fallire il job.
    try {
      await sendPushToUser(userId, {
        title: "Analisi pronta",
        body: analysisPushBody(result.summary),
        url: `/activities/${activityId}`,
        tag: `eval-${activityId}`,
      });
    } catch (pushError) {
      console.error("runActivityEvaluation push:", pushError);
    }
  } catch (error) {
    console.error("runActivityEvaluation:", error);
    await admin.from("ai_jobs").update({ status: "error", error: aiErrorMessage(error), updated_at: new Date().toISOString() }).eq("id", jobId);
  }
}
