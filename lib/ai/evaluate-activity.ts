import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiConfig } from "@/lib/ai/credentials";
import { buildAiContext, serializeAiContext } from "@/lib/ai/context-envelope";
import { activityDetailLine } from "@/lib/ai/context";
import { buildEvaluationPrompt, evaluationResponseSchemaZod, evaluationSchema } from "@/lib/ai/prompt";
import { aiErrorMessage, generateStructured } from "@/lib/ai/gemini";
import type { GeminiModelId } from "@/lib/ai/models";
import { isoDateShift } from "@/lib/dates";
import type { Activity, EvaluationResult, PlannedWorkout, Profile } from "@/lib/types";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";

type EvalActivity = Pick<Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" |
  "moving_time_s" | "avg_pace_s_km" | "avg_hr" | "max_hr" | "rpe" |
  "rpe_source" | "source_title" | "elevation_gain_m" | "hr_drift_pct" |
  "avg_cadence_spm" | "time_in_zone" | "splits" | "notes"
>;

export async function enqueueActivityEvaluation(
  userId: string,
  activityId: string,
): Promise<string | null> {
  const gemini = await getGeminiConfig(userId);
  if (!gemini) return null;
  const admin = createAdminClient();
  const { data: current } = await admin.from("ai_jobs").select("id").eq("user_id", userId).eq("kind", "evaluation").eq("ref_id", activityId).eq("status", "pending").limit(1).maybeSingle<{ id: string }>();
  if (current) return current.id;
  const { data: job, error } = await admin.from("ai_jobs").insert({ user_id: userId, kind: "evaluation", ref_id: activityId, status: "pending" }).select("id").single<{ id: string }>();
  if (error || !job) throw error ?? new Error("Job non creato");
  after(() => runActivityEvaluation(job.id, userId, activityId, gemini.apiKey, gemini.model));
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

async function runActivityEvaluation(
  jobId: string,
  userId: string,
  activityId: string,
  apiKey: string,
  model: GeminiModelId,
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

    const activityDay = activity.started_at.slice(0, 10);
    const [nearbyPlanResult, existingEvaluationResult] = await Promise.all([
      admin
        .from("planned_workouts")
        .select("date, type, target_distance_m, target_pace_s_km, target_duration_s, target_hr_bpm, description, focus")
        .eq("user_id", userId)
        .gte("date", isoDateShift(activityDay, -3))
        .lte("date", isoDateShift(activityDay, 3))
        .order("date")
        .returns<Array<Pick<PlannedWorkout, "date" | "type" | "target_distance_m" | "target_pace_s_km" | "target_duration_s" | "target_hr_bpm" | "description" | "focus">>>(),
      admin
        .from("evaluations")
        .select("id, details")
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; details: string[] | null }>(),
    ]);
    const { data: nearbyPlan, error: nearbyPlanError } = nearbyPlanResult;
    const { data: existingEvaluation, error: existingEvaluationError } = existingEvaluationResult;
    if (nearbyPlanError ?? existingEvaluationError) {
      throw nearbyPlanError ?? existingEvaluationError;
    }
    const detail = [
      activity.source_title ? `Titolo dal file: ${activity.source_title}.` : "",
      activityDetailLine(activity, effectiveHr),
      activity.rpe != null ? `Origine RPE: ${activity.rpe_source ?? "non specificata"}.` : "RPE non disponibile.",
      activity.splits?.length ? `Split per km: ${JSON.stringify(activity.splits)}.` : "",
      existingEvaluation?.details?.length
        ? `Dettagli già catalogati da conservare e consolidare: ${JSON.stringify(existingEvaluation.details)}.`
        : "",
    ].filter(Boolean).join("\n");
    const rawResult = await generateStructured<unknown>(
      buildEvaluationPrompt(
        serializeAiContext(context),
        detail,
        nearbyPlan?.length ? JSON.stringify(nearbyPlan) : null,
      ),
      evaluationSchema,
      { apiKey, model },
    );
    const result: EvaluationResult = evaluationResponseSchemaZod.parse(rawResult);

    const evaluationPayload = {
      model,
      summary: result.summary,
      details: result.details,
      flags: result.flags ?? {},
    };
    const { error: evaluationError } = existingEvaluation
      ? await admin.from("evaluations").update(evaluationPayload).eq("id", existingEvaluation.id)
      : await admin.from("evaluations").insert({
          user_id: userId,
          activity_id: activityId,
          ...evaluationPayload,
        });
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
      metadata: { flags: result.flags ?? {}, details: result.details },
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
  } catch (error) {
    console.error("runActivityEvaluation:", error);
    await admin.from("ai_jobs").update({ status: "error", error: aiErrorMessage(error), updated_at: new Date().toISOString() }).eq("id", jobId);
  }
}
