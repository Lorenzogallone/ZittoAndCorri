import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeATLCTL } from "@/lib/metrics/load";
import { calibratePaces, type PaceCalibrationEntry } from "@/lib/metrics/pace-calibration";
import { hrZones } from "@/lib/metrics/zones";
import { predictRaces } from "@/lib/metrics/predict";
import type {
  Activity,
  CoachMemory,
  CoachMessage,
  Goal,
  PlannedWorkout,
  Profile,
  RacePredict,
  ATLCTLResult,
} from "@/lib/types";
import { missingAiContextSections } from "@/lib/ai/context-contract";

export type AiContextPurpose = "chat" | "plan" | "evaluation";
export type DataOrigin = "measured" | "user" | "derived" | "estimated";

type ContextActivity = Pick<
  Activity,
  | "id"
  | "source"
  | "started_at"
  | "type"
  | "sport"
  | "distance_m"
  | "duration_s"
  | "moving_time_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "max_hr"
  | "elevation_gain_m"
  | "rpe"
  | "rpe_source"
  | "source_title"
  | "notes"
  | "time_in_zone"
  | "splits"
  | "avg_cadence_spm"
  | "hr_drift_pct"
  | "calories"
>;

type ContextActivityForAi = ContextActivity & {
  data_origin: {
    device_metrics: DataOrigin;
    pace_zones_drift_splits: "derived";
    rpe: DataOrigin | null;
    source_title: "measured" | null;
    notes: "user" | null;
  };
};

export interface AiContextEnvelope {
  meta: {
    purpose: AiContextPurpose;
    as_of: string;
    today: string;
    timezone: "Europe/Rome";
    locale: "it-IT";
    language: "it";
    prompt_version: "coach-v2";
    data_freshness: {
      queried_at: string;
      detailed_history_from: string;
      aggregate_history_from: string;
    };
  };
  athlete: {
    display_name: string | null;
    birthdate: string | null;
    max_hr: { value: number | null; origin: "user" };
    resting_hr: { value: number | null; origin: "user" };
    hr_zones: { value: ReturnType<typeof hrZones>; origin: "derived" };
  };
  goal: (Pick<Goal, "id" | "race_name" | "race_date" | "distance_m" | "target_time_s"> & {
    days_remaining: number | null;
    weeks_remaining: number | null;
    origin: "user";
  }) | null;
  training_state: {
    load: {
      load7: number;
      atl: number;
      ctl: number;
      tsb: number;
      baseline7: number | null;
      load_ratio: number | null;
      status: ATLCTLResult["status"];
      confidence: ATLCTLResult["confidence"];
      origin: "derived";
      rpe_estimates_used: number;
    };
    load_before_focus_activity: {
      load7: number;
      atl: number;
      ctl: number;
      tsb: number;
      baseline7: number | null;
      load_ratio: number | null;
      status: ATLCTLResult["status"];
      confidence: ATLCTLResult["confidence"];
      origin: "derived";
      rpe_estimates_used: number;
    } | null;
    windows: Record<"7d" | "28d" | "42d", {
      running_distance_m: number;
      running_duration_s: number;
      all_sports_duration_s: number;
      activities: number;
      origin: "derived";
    }>;
    plan_comparison: {
      method: "infer_from_dates_and_activity_data";
      note: string;
    };
    predictions: (RacePredict & { origin: "derived"; reference_activity_id: string }) | null;
  };
  history: {
    detailed_21d: ContextActivityForAi[];
    weekly_12w: Array<{
      week_start: string;
      running_distance_m: number;
      running_duration_s: number;
      other_sports_duration_s: number;
      sessions: number;
      average_rpe: number | null;
      origin: "derived";
    }>;
  };
  pace_hr_calibration: Array<PaceCalibrationEntry & { origin: "derived" }> | null;
  current_plan: {
    recent_14d: PlannedWorkout[];
    upcoming_14d: PlannedWorkout[];
  };
  memories: Array<Pick<CoachMemory, "id" | "category" | "content" | "valid_from" | "valid_until" | "source" | "source_message_id" | "confidence">>;
  conversation: {
    summary: string | null;
    recent_messages: Array<Pick<CoachMessage, "id" | "role" | "kind" | "content" | "created_at">>;
  };
  evaluations: Array<{ summary: string; details: string[]; created_at: string; activity_id: string; origin: "derived" }>;
  focus_activity: ContextActivityForAi | null;
  missing_data: string[];
}

function romeDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function activeSeconds(a: Pick<Activity, "duration_s" | "moving_time_s">): number {
  return a.moving_time_s ?? a.duration_s;
}

function bestReference(activities: ContextActivity[]): ContextActivity | null {
  let best: ContextActivity | null = null;
  let bestEquivalent = Number.POSITIVE_INFINITY;
  for (const a of activities) {
    if (a.sport !== "running" || a.distance_m < 1000 || activeSeconds(a) <= 0) continue;
    const equivalent10k = activeSeconds(a) * (10_000 / a.distance_m) ** 1.06;
    if (equivalent10k < bestEquivalent) {
      bestEquivalent = equivalent10k;
      best = a;
    }
  }
  return best;
}

function windowStats(activities: ContextActivity[], since: string) {
  const selected = activities.filter((a) => a.started_at.slice(0, 10) >= since);
  const running = selected.filter((a) => a.sport === "running");
  return {
    running_distance_m: running.reduce((sum, a) => sum + a.distance_m, 0),
    running_duration_s: running.reduce((sum, a) => sum + activeSeconds(a), 0),
    all_sports_duration_s: selected.reduce((sum, a) => sum + activeSeconds(a), 0),
    activities: selected.length,
    origin: "derived" as const,
  };
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function weeklyHistory(activities: ContextActivity[]) {
  const weeks = new Map<string, ContextActivity[]>();
  for (const a of activities) {
    const key = mondayOf(a.started_at.slice(0, 10));
    weeks.set(key, [...(weeks.get(key) ?? []), a]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, rows]) => {
      const running = rows.filter((a) => a.sport === "running");
      const other = rows.filter((a) => a.sport !== "running");
      const rpes = rows.flatMap((a) => (a.rpe == null ? [] : [a.rpe]));
      return {
        week_start,
        running_distance_m: running.reduce((s, a) => s + a.distance_m, 0),
        running_duration_s: running.reduce((s, a) => s + activeSeconds(a), 0),
        other_sports_duration_s: other.reduce((s, a) => s + activeSeconds(a), 0),
        sessions: rows.length,
        average_rpe: rpes.length
          ? Math.round((rpes.reduce((s, value) => s + value, 0) / rpes.length) * 10) / 10
          : null,
        origin: "derived" as const,
      };
    });
}

function activityForAi(activity: ContextActivity): ContextActivityForAi {
  const rpeOrigin: DataOrigin | null = activity.rpe == null
    ? null
    : activity.rpe_source === "fit"
      ? "measured"
      : activity.rpe_source === "user"
        ? "user"
        : activity.rpe_source === "api"
          ? "measured"
          : "estimated";
  return {
    ...activity,
    data_origin: {
      device_metrics: activity.source === "manual" ? "user" : "measured",
      pace_zones_drift_splits: "derived",
      rpe: rpeOrigin,
      source_title: activity.source_title ? "measured" : null,
      notes: activity.notes ? "user" : null,
    },
  };
}

export async function buildAiContext(
  supabase: SupabaseClient,
  userId: string,
  purpose: AiContextPurpose,
  options?: { activityId?: string },
): Promise<AiContextEnvelope> {
  const now = new Date();
  const today = romeDate(now);
  const since90 = shiftDate(today, -90);
  const since21 = shiftDate(today, -20);
  const since14 = shiftDate(today, -13);
  const until14 = shiftDate(today, 13);

  const [
    { data: authUserData, error: authUserError },
    { data: profile, error: profileError },
    { data: goal, error: goalError },
    { data: activities, error: activitiesError },
    { data: recentPlan, error: recentPlanError },
    { data: upcomingPlan, error: upcomingPlanError },
    { data: memories, error: memoriesError },
    { data: messages, error: messagesError },
    { data: state, error: stateError },
    { data: evaluations, error: evaluationsError },
  ] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("profiles").select("birthdate, max_hr, resting_hr").eq("id", userId).maybeSingle<Pick<Profile, "birthdate" | "max_hr" | "resting_hr">>(),
    supabase.from("goals").select("id, race_name, race_date, distance_m, target_time_s").eq("user_id", userId).eq("is_active", true).maybeSingle<Pick<Goal, "id" | "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    supabase.from("activities").select("id, source, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr, max_hr, elevation_gain_m, rpe, rpe_source, source_title, notes, time_in_zone, splits, avg_cadence_spm, hr_drift_pct, calories").eq("user_id", userId).gte("started_at", `${since90}T00:00:00`).order("started_at").returns<ContextActivity[]>(),
    supabase.from("planned_workouts").select("*").eq("user_id", userId).gte("date", since14).lt("date", today).order("date").returns<PlannedWorkout[]>(),
    supabase.from("planned_workouts").select("*").eq("user_id", userId).gte("date", today).lte("date", until14).order("date").returns<PlannedWorkout[]>(),
    supabase.from("coach_memories").select("id, category, content, valid_from, valid_until, source, source_message_id, confidence").eq("user_id", userId).eq("is_active", true).or(`valid_until.is.null,valid_until.gte.${today}`).order("created_at").returns<Array<Pick<CoachMemory, "id" | "category" | "content" | "valid_from" | "valid_until" | "source" | "source_message_id" | "confidence">>>(),
    supabase.from("coach_messages").select("id, role, kind, content, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(24).returns<Array<Pick<CoachMessage, "id" | "role" | "kind" | "content" | "created_at">>>(),
    supabase.from("coach_state").select("conversation_summary").eq("user_id", userId).maybeSingle<{ conversation_summary: string | null }>(),
    supabase.from("evaluations").select("summary, details, created_at, activity_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(5).returns<Array<{ summary: string | null; details: string[] | null; created_at: string; activity_id: string }>>(),
  ]);

  const queryErrors = [
    authUserError, profileError, goalError, activitiesError, recentPlanError, upcomingPlanError,
    memoriesError, messagesError, stateError, evaluationsError,
  ].filter((error): error is NonNullable<typeof error> => error != null);
  if (queryErrors.length) {
    throw new Error(`Contesto AI non disponibile: ${queryErrors.map((error) => error.message).join("; ")}`);
  }

  const acts = activities ?? [];
  const recent = recentPlan ?? [];
  const upcoming = upcomingPlan ?? [];
  const profileConfig = {
    max_hr: profile?.max_hr ?? null,
    resting_hr: profile?.resting_hr ?? null,
  };
  const best = bestReference(acts);
  const focusActivity = options?.activityId
    ? acts.find((candidate) => candidate.id === options.activityId) ?? null
    : null;
  const predictions = best
    ? { ...predictRaces({ distance_m: best.distance_m, duration_s: activeSeconds(best) }, goal?.distance_m), origin: "derived" as const, reference_activity_id: best.id }
    : null;
  const load = computeATLCTL(
    acts.map((a) => ({
      started_at: a.started_at,
      duration_s: activeSeconds(a),
      rpe: a.rpe,
      avg_hr: a.avg_hr,
      time_in_zone: a.time_in_zone,
      sport: a.sport,
    })),
    today,
    profileConfig,
  );
  const activitiesBeforeFocus = focusActivity
    ? acts.filter((activity) => activity.started_at < focusActivity.started_at)
    : [];
  const loadBeforeFocus = focusActivity
    ? computeATLCTL(
        activitiesBeforeFocus.map((activity) => ({
          started_at: activity.started_at,
          duration_s: activeSeconds(activity),
          rpe: activity.rpe,
          avg_hr: activity.avg_hr,
          time_in_zone: activity.time_in_zone,
          sport: activity.sport,
        })),
        focusActivity.started_at.slice(0, 10),
        profileConfig,
      )
    : null;
  const calibration = calibratePaces(acts, profileConfig)?.map((entry) => ({
    ...entry,
    origin: "derived" as const,
  })) ?? null;
  const missing: string[] = [];
  if (!profile?.max_hr) missing.push("max_hr");
  if (!profile?.resting_hr) missing.push("resting_hr");
  if (!goal) missing.push("active_goal");
  if (acts.length === 0) missing.push("training_history");
  if (acts.some((a) => a.rpe == null)) missing.push("rpe_on_some_activities");

  const raceDate = goal?.race_date ? new Date(`${goal.race_date}T12:00:00Z`) : null;
  const daysRemaining = raceDate
    ? Math.max(0, Math.ceil((raceDate.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000))
    : null;

  return {
    meta: {
      purpose,
      as_of: now.toISOString(),
      today,
      timezone: "Europe/Rome",
      locale: "it-IT",
      language: "it",
      prompt_version: "coach-v2",
      data_freshness: {
        queried_at: now.toISOString(),
        detailed_history_from: since21,
        aggregate_history_from: since90,
      },
    },
    athlete: {
      display_name: typeof authUserData.user?.user_metadata?.full_name === "string"
        ? authUserData.user.user_metadata.full_name
        : typeof authUserData.user?.user_metadata?.name === "string"
          ? authUserData.user.user_metadata.name
          : null,
      birthdate: profile?.birthdate ?? null,
      max_hr: { value: profileConfig.max_hr, origin: "user" },
      resting_hr: { value: profileConfig.resting_hr, origin: "user" },
      hr_zones: { value: hrZones(profileConfig), origin: "derived" },
    },
    goal: goal ? { ...goal, days_remaining: daysRemaining, weeks_remaining: daysRemaining == null ? null : Math.ceil(daysRemaining / 7), origin: "user" } : null,
    training_state: {
      load: {
        load7: load.load7,
        atl: load.atl,
        ctl: load.ctl,
        tsb: load.tsb,
        baseline7: load.baseline7,
        load_ratio: load.load_ratio,
        status: load.status,
        confidence: load.confidence,
        origin: "derived",
        rpe_estimates_used: load.sources.estimated,
      },
      load_before_focus_activity: loadBeforeFocus ? {
        load7: loadBeforeFocus.load7,
        atl: loadBeforeFocus.atl,
        ctl: loadBeforeFocus.ctl,
        tsb: loadBeforeFocus.tsb,
        baseline7: loadBeforeFocus.baseline7,
        load_ratio: loadBeforeFocus.load_ratio,
        status: loadBeforeFocus.status,
        confidence: loadBeforeFocus.confidence,
        origin: "derived",
        rpe_estimates_used: loadBeforeFocus.sources.estimated,
      } : null,
      windows: {
        "7d": windowStats(acts, shiftDate(today, -6)),
        "28d": windowStats(acts, shiftDate(today, -27)),
        "42d": windowStats(acts, shiftDate(today, -41)),
      },
      plan_comparison: {
        method: "infer_from_dates_and_activity_data",
        note: "Piano e attività non hanno collegamenti espliciti: deduci quanto è stato svolto confrontando date, distanza, durata, passo, HR e note; non usare lo status come prova di aderenza.",
      },
      predictions,
    },
    history: {
      detailed_21d: acts.filter((a) => a.started_at.slice(0, 10) >= since21).map(activityForAi),
      weekly_12w: weeklyHistory(acts),
    },
    pace_hr_calibration: calibration,
    current_plan: { recent_14d: recent, upcoming_14d: upcoming },
    memories: memories ?? [],
    conversation: { summary: state?.conversation_summary ?? null, recent_messages: [...(messages ?? [])].reverse() },
    evaluations: (evaluations ?? []).flatMap((e) => e.summary ? [{ summary: e.summary, details: e.details ?? [], created_at: e.created_at, activity_id: e.activity_id, origin: "derived" as const }] : []),
    focus_activity: focusActivity ? activityForAi(focusActivity) : null,
    missing_data: missing,
  };
}

export function serializeAiContext(context: AiContextEnvelope): string {
  const missing = missingAiContextSections(context);
  if (missing.length) throw new Error(`Contesto AI incompleto: ${missing.join(", ")}`);
  return JSON.stringify(context, null, 2);
}
