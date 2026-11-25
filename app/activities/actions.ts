"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ingestActivity, type IngestOutcome } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { deletedImportFor, isMissingTable } from "@/lib/ingest/deleted-imports";
import { parseDecimal, parseDuration } from "@/lib/format";
import type { Activity, Profile } from "@/lib/types";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage, timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { enqueueEvaluationAfterIngest } from "@/lib/ai/evaluate-activity";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { persistDerived } from "@/lib/derived";

export interface ActivityFormState {
  error?: string;
  /** Id of the created run: the client navigates to the detail (see navigateAfterMutation). */
  id?: string;
  evaluationJobId?: string;
}

/** Reads an optional number field from the form; "" → undefined. */
function optInt(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export async function createActivity(
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const t = await getTranslations("activities.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // --- form input parsing ---
  const startedAtLocal = String(formData.get("started_at") ?? "").trim();
  if (!startedAtLocal) return { error: t("dateRequired") };
  const startedAt = new Date(startedAtLocal);
  if (Number.isNaN(startedAt.getTime())) return { error: t("dateInvalid") };

  const sport = String(formData.get("sport") ?? "running");
  const isRunning = sport === "running";

  // Distance: required for running; optional for other sports
  // (gym, football, yoga… often have no sensible one).
  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  const distanceKm = distanceRaw === "" ? 0 : parseDecimal(distanceRaw);
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || (isRunning && distanceKm <= 0)) {
    return { error: t("distanceInvalid") };
  }
  const duration_s = parseDuration(String(formData.get("duration") ?? ""));
  if (duration_s == null || duration_s <= 0) {
    return { error: t("durationInvalid") };
  }

  const type = String(formData.get("type") ?? "easy");
  const notes = String(formData.get("notes") ?? "").trim();

  // --- profile (for zones-from-average) ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  // --- unified ingest ---
  let outcome: IngestOutcome;
  try {
    outcome = await ingestActivity(
      {
        source: "manual",
        type,
        sport,
        started_at: startedAt.toISOString(),
        distance_m: Math.round(distanceKm * 1000),
        duration_s,
        avg_hr: optInt(formData, "avg_hr"),
        max_hr: optInt(formData, "max_hr"),
        elevation_gain_m: optInt(formData, "elevation_gain_m"),
        rpe: optInt(formData, "rpe"),
        rpe_source: optInt(formData, "rpe") != null ? "user" : undefined,
        notes: notes || undefined,
      },
      {
        supabase,
        userId: user.id,
        profile: effectiveHr,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : t("saveFailed");
    return { error: msg };
  }

  revalidatePath("/activities");
  const activityId = outcome.id;
  const evaluationJobId = await enqueueEvaluationAfterIngest(user.id, outcome);
  // No server-side redirect: we return the id and the client navigates (soft from
  // browser, full load in standalone PWA, where soft navigation hangs).
  return { id: activityId, evaluationJobId: evaluationJobId ?? undefined };
}

export interface GpxImportFormState {
  error?: string;
}

export async function importGpxActivity(
  _prevState: GpxImportFormState,
  formData: FormData,
): Promise<GpxImportFormState> {
  const t = await getTranslations("activities.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("gpx_file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("noFile") };
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "gpx") {
    return { error: t("gpxOnly") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  const ctx = {
    supabase,
    userId: user.id,
    profile: effectiveHr,
  };

  let outcome: IngestOutcome;
  try {
    const text = await file.text();
    const input = parseGpx(text);
    outcome = await ingestActivity(input, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : t("importFailed") };
  }

  revalidatePath("/activities");
  await enqueueEvaluationAfterIngest(user.id, outcome);
  redirect(`/activities/${outcome.id}`, RedirectType.replace);
}

export async function deleteActivity(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Trace of the deleted imported run, before deleting it: without it,
  // the next import from Intervals.icu would recreate it. "*": external_id
  // exists only since migration 0025. Without the table (migration 0032) we
  // delete as before.
  const { data: stored } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Activity & { external_id?: string | null }>();
  const tombstone = stored ? deletedImportFor(stored) : null;
  if (tombstone) {
    const { error } = await supabase.from("deleted_imports").insert({ user_id: user.id, ...tombstone });
    // 23505: the external id is already marked as deleted.
    if (error && !isMissingTable(error) && error.code !== "23505") {
      console.error("deleteActivity tombstone:", error.message);
    }
  }

  // RLS + explicit user_id filter: the user deletes only their own runs.
  await supabase.from("activities").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/activities");
  // Navigation is done by the client (navigateAfterMutation): no server-side redirect,
  // which in standalone PWA leaves the page hanging in loading.
}

/** Excludes (or restores) a run from totals, records and load. Reversible. */
export async function setActivityExcluded(
  id: string,
  excluded: boolean,
  reason: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const t = await getTranslations("activities.errors");
  const tBanner = await getTranslations("activities.excludedBanner");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: t("activityInvalid") };
  const { error } = await supabase
    .from("activities")
    .update(excluded
      ? { excluded_at: new Date().toISOString(), excluded_reason: reason?.trim().slice(0, 200) || tBanner("byAthlete") }
      : { excluded_at: null, excluded_reason: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { error: error.code === "42703" ? t("needsMigration") : t("updateFailed") };
  }
  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
  revalidatePath("/profile");
  revalidatePath("/");
  return { ok: true };
}

export interface EditActivityFormState {
  error?: string;
  /** Id of the updated run: the client navigates to the detail. */
  id?: string;
}

export async function updateActivity(
  _prevState: EditActivityFormState,
  formData: FormData,
): Promise<EditActivityFormState> {
  const t = await getTranslations("activities.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: t("idMissing") };

  // Fetch existing activity to verify owner
  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Activity>();

  if (!activity) {
    return { error: t("notFound") };
  }

  const startedAtLocal = String(formData.get("started_at") ?? "").trim();
  if (!startedAtLocal) return { error: t("dateRequired") };
  const startedAt = new Date(startedAtLocal);
  if (Number.isNaN(startedAt.getTime())) return { error: t("dateInvalid") };

  // Sport: if it does not come from the form (old forms) the existing one stays.
  const sportRaw = String(formData.get("sport") ?? "").trim();
  const sport = sportRaw || activity.sport || "running";
  const isRunning = sport === "running";

  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  const distanceKm = distanceRaw === "" ? 0 : parseDecimal(distanceRaw);
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || (isRunning && distanceKm <= 0)) {
    return { error: t("distanceInvalid") };
  }
  const duration_s = parseDuration(String(formData.get("duration") ?? ""));
  if (duration_s == null || duration_s <= 0) {
    return { error: t("durationInvalid") };
  }

  // DB constraint: non-running activities always have type 'cross'.
  const type = isRunning ? String(formData.get("type") ?? activity.type) : "cross";
  const notes = String(formData.get("notes") ?? "").trim();
  const rpe = optInt(formData, "rpe");
  const avg_hr = optInt(formData, "avg_hr");
  const max_hr = optInt(formData, "max_hr");
  const elevation_gain_m = optInt(formData, "elevation_gain_m");

  const distance_m = Math.round(distanceKm * 1000);
  // Pace on moving time if the run has one (FIT/GPX import with
  // pauses): consistent with the ingest calculation and with Strava. Total duration
  // stays editable; moving_time_s is not edited here, we preserve it.
  const paceTime = activity.moving_time_s ?? duration_s;
  const avg_pace_s_km = distance_m > 0 ? avgPace(distance_m, paceTime) : null;

  // Fetch profile to calculate zone
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  const profileCtx = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  // Load streams if they exist
  const { data: streams } = await supabase
    .from("activity_streams")
    .select("hr_series, gps_series")
    .eq("activity_id", id)
    .maybeSingle();

  // Recalculate HR Zones and splits if they exist
  let time_in_zone = activity.time_in_zone;
  if (streams?.hr_series && streams.hr_series.length >= 2) {
    time_in_zone = timeInZoneFromSeries(streams.hr_series, profileCtx);
  } else {
    time_in_zone = timeInZoneFromAverage(avg_hr ?? null, duration_s, profileCtx);
  }

  let splits = activity.splits;
  if (streams?.gps_series && streams.gps_series.length >= 2) {
    splits = computeSplits(streams.gps_series, streams.hr_series ?? undefined);
  }

  // Perform update
  const { error } = await supabase
    .from("activities")
    .update({
      type,
      sport,
      notes: notes || null,
      rpe: rpe ?? null,
      rpe_source: rpe != null ? "user" : null,
      started_at: startedAt.toISOString(),
      distance_m,
      duration_s,
      avg_pace_s_km,
      avg_hr: avg_hr ?? null,
      max_hr: max_hr ?? null,
      elevation_gain_m: elevation_gain_m ?? null,
      time_in_zone,
      splits,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }
  await persistDerived(supabase, user.id, {
    id,
    sport: sport as Activity["sport"],
    started_at: startedAt.toISOString(),
    distance_m,
    duration_s,
    moving_time_s: activity.moving_time_s,
  }, streams?.gps_series ?? null);

  revalidatePath(`/activities/${id}`);
  revalidatePath("/activities");
  return { id };
}

export async function saveParsedActivity(
  input: unknown,
): Promise<{ error?: string; id?: string; evaluationJobId?: string }> {
  const t = await getTranslations("activities.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);

  try {
    const outcome = await ingestActivity(input, {
      supabase,
      userId: user.id,
      profile: effectiveHr,
    });

    revalidatePath("/activities");
    const evaluationJobId = await enqueueEvaluationAfterIngest(user.id, outcome);
    return { id: outcome.id, evaluationJobId: evaluationJobId ?? undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : t("saveFailed") };
  }
}
