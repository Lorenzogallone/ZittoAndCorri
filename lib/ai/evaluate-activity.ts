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
import { analysisPush } from "@/lib/push/analysis-push";
import { extractDeclaredStructure, mayDescribeStructure } from "@/lib/ai/interval-structure";
import { intervalsUpToDate, isMissingColumn, persistIntervals, plannedForActivity, type DeclaredIntervals } from "@/lib/derived";
import type { IntervalAnalysis } from "@/lib/metrics/intervals";
import { intervalsForPrompt } from "@/lib/intervals-text";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isStaleAiJob, STALE_AI_JOB_ERROR } from "@/lib/ai/job-staleness";
import { evaluationAfterIngest, type IngestOutcome } from "@/lib/ingest/enrichment";
import { romeDay } from "@/lib/local-date";
import { requestLocale } from "@/lib/ai/request-locale";
import type { Locale } from "../../i18n/config.ts";
import { staticTranslator } from "@/lib/static-translator";
import { sortByDayOrder } from "@/lib/plan/day-sessions";

type EvalActivity = Pick<Activity,
  "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" |
  "moving_time_s" | "avg_pace_s_km" | "avg_hr" | "max_hr" | "rpe" |
  "rpe_source" | "source_title" | "elevation_gain_m" | "hr_drift_pct" |
  "avg_cadence_spm" | "time_in_zone" | "splits" | "notes"
>;

type SameDayActivity = Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "avg_hr">;

/** Planned session for the prompt, with its place in the day. */
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
    /** Session matched to this activity (time, distance, duration, order). */
    matched: workout.id === matchedId,
  };
}

const romeTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/**
 * Other activities on the same day, with the distance in minutes from this one:
 * a separately recorded warm-up ends a few minutes before the session.
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
  options: { notify?: boolean } = {},
): Promise<string | null> {
  const notify = options.notify !== false;
  const locale = await requestLocale();
  const ai = await getAiConfig(userId, "analysis");
  if (!ai) return null;
  const admin = createAdminClient();
  const { data: pendingJobs } = await admin.from("ai_jobs").select("id, status, created_at").eq("user_id", userId).eq("kind", "evaluation").eq("ref_id", activityId).eq("status", "pending").order("created_at", { ascending: false }).returns<Array<{ id: string; status: string; created_at: string | null }>>();
  // A job pending for too long (function timed out, half-finished deploy) no longer blocks
  // the new analysis: it is closed as an error and a new one is created.
  const stale = (pendingJobs ?? []).filter((job) => isStaleAiJob(job));
  if (stale.length) {
    await admin.from("ai_jobs").update({ status: "error", error: STALE_AI_JOB_ERROR, updated_at: new Date().toISOString() }).in("id", stale.map((job) => job.id)).eq("status", "pending");
  }
  const current = (pendingJobs ?? []).find((job) => !isStaleAiJob(job));
  if (current) return current.id;
  const { data: job, error } = await admin.from("ai_jobs").insert({ user_id: userId, kind: "evaluation", ref_id: activityId, status: "pending" }).select("id").single<{ id: string }>();
  if (error || !job) throw error ?? new Error("Job non creato");
  after(() => runActivityEvaluation(job.id, userId, activityId, ai, notify, locale));
  return job.id;
}

/**
 * Analysis after an import: an already analyzed enriched run is re-analyzed
 * only if the data really changed, and without a second notification.
 * Never throws: imports must not fail after the run is saved.
 */
export async function enqueueEvaluationAfterIngest(
  userId: string,
  outcome: IngestOutcome,
): Promise<string | null> {
  try {
    let hasEvaluation = false;
    if (!outcome.created) {
      const { data, error } = await createAdminClient()
        .from("evaluations")
        .select("id")
        .eq("user_id", userId)
        .eq("activity_id", outcome.id)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (error) throw error;
      hasEvaluation = data != null;
    }
    const decision = evaluationAfterIngest(outcome, hasEvaluation);
    if (decision === "skip") return null;
    return await enqueueActivityEvaluation(userId, outcome.id, { notify: decision === "notify" });
  } catch (error) {
    console.error("enqueueEvaluationAfterIngest:", error);
    return null;
  }
}


/**
 * Run segments for the evaluation. A structure just read from the note
 * forces a full recompute; otherwise the saved analysis is used if up to date.
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
  notify: boolean,
  locale: Locale,
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
      // "*": order, time of day and link of the sessions exist only since migration 0029.
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
    // The session most similar to this run on its day or, if moved, within two days before or after.
    const matched = await plannedForActivity(admin, userId, activity);
    const nearbyPlan = nearbyPlanResult.data
      ? sortByDayOrder(nearbyPlanResult.data).map((workout) => planForPrompt(workout, matched?.id ?? null))
      : null;
    const nearbyPlanError = nearbyPlanResult.error;
    const sameDay = sameDayLines(activity, others);
    const { data: existingEvaluation, error: existingEvaluationError } = existingEvaluationResult;
    if (nearbyPlanError ?? existingEvaluationError) {
      throw nearbyPlanError ?? existingEvaluationError;
    }
    // Structure written in the note (e.g. "3 × (3' hard + 1' jog + 1' sprint)"):
    // Gemini reads it, then the segments are measured on the file. Never blocking.
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
        locale,
      ),
      evaluationSchema,
      ai,
      "evaluation",
    );
    const result: EvaluationResult = evaluationResponseSchemaZod.parse(rawResult);
    // Note reading + evaluation: the cost shown is that of the whole analysis.
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
    // Without migration 0024 the cost stays only on the chat message.
    if (isMissingColumn(evaluationError)) ({ error: evaluationError } = await saveEvaluation(evaluationPayload));
    if (evaluationError) throw evaluationError;

    // The free comment is only input material: once it has been turned
    // into structured points it must not stay visible nor be
    // repeated in later evaluations.
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
    // The notification is an extra: any problem must not make the job fail.
    // A re-analysis after an enrichment does not send a second push.
    if (notify) {
      try {
        await sendPushToUser(userId, {
          ...(await analysisPush(admin, userId, locale, result.summary)),
          url: `/activities/${activityId}`,
          tag: `eval-${activityId}`,
        });
      } catch (pushError) {
        console.error("runActivityEvaluation push:", pushError);
      }
    }
  } catch (error) {
    console.error("runActivityEvaluation:", error);
    // Goes into the database (ai_jobs.error): without the user's language in the cron, it stays Italian.
    await admin.from("ai_jobs").update({ status: "error", error: aiErrorMessage(error, await staticTranslator("it", "status")), updated_at: new Date().toISOString() }).eq("id", jobId);
  }
}
