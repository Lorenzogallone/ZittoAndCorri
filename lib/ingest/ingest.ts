// Ingest pipeline. PLAN.md §6:
// 1. validate with Zod; 2. compute derived fields; 3. insert into activities; 4. (Phase 4) snapshot + AI.

import type { SupabaseClient } from "@supabase/supabase-js";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage, timeInZoneFromSeries, type HrConfig } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { avgCadenceSpm, computeHrDrift, type CadencePoint } from "@/lib/metrics/effort";
import { isMissingColumn, persistDerived } from "@/lib/derived";
import type { Activity, ActivityStream } from "@/lib/types";
import { ActivityInput } from "./schema";
import { bestMovingTime, movingTimeFromStreams } from "@/lib/metrics/pauses";
import { enrichmentIsSubstantial, type EnrichmentSnapshot, type IngestOutcome } from "./enrichment";

export type { IngestOutcome } from "./enrichment";

interface IngestContext {
  supabase: SupabaseClient;
  userId: string;
  /** Effective athlete config: Zepp zones when available, otherwise manual HRR. */
  profile: HrConfig;
}

// File imports of the same activity (same sport, start within this
// window) enrich the existing row instead of duplicating it: e.g. a GPX
// shared from Zepp right away and a full FIT (cadence) imported later.
const DEDUPE_WINDOW_MIN = 10;

/**
 * Normalizes any input into an `activities` row, computes the derived
 * fields with the pure functions in `lib/metrics`, and persists it along with
 * any streams in `activity_streams`.
 *
 * For file imports (source 'file'), if an activity of the same
 * sport started within ±10 minutes already exists, it does NOT create a duplicate: it fills the
 * missing fields/streams of the existing row and recomputes the derived metrics.
 * Returns the id of the created (or enriched) run, whether it is new and, for
 * enrichments, whether the data read by the analysis actually changed.
 */
export async function ingestActivity(
  input: unknown,
  ctx: IngestContext,
): Promise<IngestOutcome> {
  // 1. validation
  const data = ActivityInput.parse(input);

  // 1b. dedupe/enrichment for file imports
  if (data.source === "file" || data.source === "intervals") {
    const existing = await findNearbyActivity(data, ctx);
    if (existing) return { ...(await enrichActivity(existing, data, ctx)), created: false };
  }

  // Non-running activities always use the 'cross' type (DB constraint).
  const type = data.sport === "running" ? data.type : "cross";

  // 2. derived fields (deterministic, never from the LLM)
  // No pace for activities without distance (gym, yoga, football…).
  // Pace on moving time when available (pauses excluded): it is the average
  // pace Strava shows. Without moving_time the total time is used.
  // If the file doesn't say, moving time is derived from the pauses in the streams.
  const moving_time_s = bestMovingTime(
    data.duration_s,
    data.moving_time_s,
    movingTimeFromStreams(data.duration_s, { distance: data.distance_series, gps: data.gps_series }),
  );
  const paceTime = moving_time_s ?? data.duration_s;
  const avg_pace_s_km =
    data.distance_m > 0 ? avgPace(data.distance_m, paceTime) : null;

  // HR zones: prefers the real series; falls back to zone-from-average
  const time_in_zone =
    data.hr_series && data.hr_series.length >= 2
      ? timeInZoneFromSeries(data.hr_series, ctx.profile)
      : timeInZoneFromAverage(data.avg_hr, data.duration_s, ctx.profile);

  // GPS splits: only if the series exists
  const splits =
    data.gps_series && data.gps_series.length >= 2
      ? computeSplits(data.gps_series, data.hr_series)
      : null;

  // Effort metrics from the streams: average cadence and cardiac drift
  // (pace/HR decoupling). They give the AI coach signals about running style and
  // how sustainable a pace really is.
  const avg_cadence_spm = avgCadenceSpm(data.cadence_series, data.sport);
  const hr_drift_pct = computeHrDrift(data.hr_series, data.gps_series);

  // The original payload is kept for audit/reprocessing, but the heavy streams
  // already live in activity_streams: duplicating them here would bloat every row.
  const rawPayload = { ...data };
  delete rawPayload.hr_series;
  delete rawPayload.gps_series;
  delete rawPayload.cadence_series;
  delete rawPayload.distance_series;
  delete rawPayload.laps;

  // 3. insert activities (RLS + explicit user_id)
  const { data: row, error } = await ctx.supabase
    .from("activities")
    .insert({
      user_id: ctx.userId,
      source: data.source,
      type,
      sport: data.sport,
      started_at: data.started_at,
      distance_m: data.distance_m,
      duration_s: data.duration_s,
      moving_time_s,
      avg_pace_s_km,
      avg_hr: data.avg_hr ?? null,
      max_hr: data.max_hr ?? null,
      elevation_gain_m: data.elevation_gain_m ?? null,
      rpe: data.rpe ?? null,
      rpe_source: data.rpe_source ?? null,
      calories: data.calories ?? null,
      source_title: data.source_title ?? null,
      // Migration 0025: only for Intervals.icu imports.
      ...(data.external_id ? { external_id: data.external_id } : {}),
      // Migration 0007 columns: included only when set, so
      // ingest without streams keeps working even on a non-migrated DB.
      ...(avg_cadence_spm != null ? { avg_cadence_spm } : {}),
      ...(hr_drift_pct != null ? { hr_drift_pct } : {}),
      time_in_zone,
      splits,
      notes: data.notes ?? null,
      raw_payload: rawPayload,
    })
    .select("id")
    .single<Pick<Activity, "id">>();

  if (error) throw error;

  // 3b. insert activity_streams if present (heavy, kept separate from the prompt)
  if (data.hr_series || data.gps_series || data.cadence_series || data.distance_series || data.laps) {
    await saveStreams(ctx, {
      activity_id: row.id,
      hr_series: data.hr_series ?? null,
      gps_series: data.gps_series ?? null,
      cadence: data.cadence_series ?? null,
      distance_series: data.distance_series ?? null,
      laps: data.laps ?? null,
    }, "insert");
  }

  // 3c. best effort, pace check and repeats (never blocking)
  await persistDerived(ctx.supabase, ctx.userId, {
    id: row.id,
    sport: data.sport,
    started_at: data.started_at,
    distance_m: data.distance_m,
    duration_s: data.duration_s,
    moving_time_s: data.moving_time_s ?? null,
  }, data.gps_series, {
    gps: data.gps_series,
    hr: data.hr_series,
    distance: data.distance_series,
    laps: data.laps,
    cadence: data.cadence_series,
  });

  // 4. The AI evaluation is queued by the caller (evaluationAfterIngest).
  return { id: row.id, created: true, substantial: true };
}

type StreamRow = {
  activity_id: string;
  hr_series: unknown;
  gps_series: unknown;
  cadence: unknown;
  distance_series: unknown;
  laps: unknown;
};

/**
 * Saves the streams. Distance and laps come with migration 0022: if the
 * columns are not there yet, the rest is saved instead of failing the import.
 */
async function saveStreams(ctx: IngestContext, row: StreamRow, mode: "insert" | "upsert"): Promise<void> {
  const write = (payload: Partial<StreamRow>) =>
    mode === "insert"
      ? ctx.supabase.from("activity_streams").insert(payload)
      : ctx.supabase.from("activity_streams").upsert(payload);
  const { error } = await write(row);
  if (!error) return;
  if (!isMissingColumn(error)) throw error;
  const legacy: Partial<StreamRow> = { ...row };
  delete legacy.distance_series;
  delete legacy.laps;
  const { error: legacyError } = await write(legacy);
  if (legacyError) throw legacyError;
}

/** Columns read to enrich an existing activity. */
type ExistingActivity = Pick<
  Activity,
  | "id"
  | "distance_m"
  | "duration_s"
  | "moving_time_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "max_hr"
  | "elevation_gain_m"
  | "calories"
  | "rpe"
  | "rpe_source"
  | "source_title"
  | "notes"
>;

/**
 * Activity of the same user and sport started within ±DEDUPE_WINDOW_MIN
 * of the input: it is the same session seen from another file.
 */
async function findNearbyActivity(
  data: ActivityInput,
  ctx: IngestContext,
): Promise<ExistingActivity | null> {
  const t = new Date(data.started_at).getTime();
  const from = new Date(t - DEDUPE_WINDOW_MIN * 60_000).toISOString();
  const to = new Date(t + DEDUPE_WINDOW_MIN * 60_000).toISOString();

  const { data: existing } = await ctx.supabase
    .from("activities")
    .select(
      "id, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr, max_hr, elevation_gain_m, calories, rpe, rpe_source, source_title, notes",
    )
    .eq("user_id", ctx.userId)
    .eq("sport", data.sport)
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at")
    .limit(1)
    .maybeSingle<ExistingActivity>();

  return existing ?? null;
}

/** Series with more samples (on a tie, the first, i.e. the one already saved). */
function longerSeries<T>(
  a: T[] | null | undefined,
  b: T[] | null | undefined,
): T[] | null {
  const aa = a && a.length > 0 ? a : null;
  const bb = b && b.length > 0 ? b : null;
  if (!aa) return bb;
  if (!bb) return aa;
  return bb.length > aa.length ? bb : aa;
}

/**
 * Enriches an existing activity with data from a second file of the
 * same session: fills the missing scalar fields, merges the streams
 * (e.g. cadence from the FIT when the GPX was already imported) and recomputes
 * the derived metrics from the best streams. Data already present, including
 * values manually revised by the user, is never overwritten.
 */
async function enrichActivity(
  existing: ExistingActivity,
  data: ActivityInput,
  ctx: IngestContext,
): Promise<{ id: string; substantial: boolean }> {
  const { data: streamRow } = await ctx.supabase
    .from("activity_streams")
    .select("*")
    .eq("activity_id", existing.id)
    .maybeSingle<ActivityStream>();

  // Best streams between saved and new (for HR/GPS the denser one wins).
  const hr = longerSeries(streamRow?.hr_series, data.hr_series);
  const gps = longerSeries(streamRow?.gps_series, data.gps_series);
  const cadence =
    (streamRow?.cadence as CadencePoint[] | null) ??
    data.cadence_series ??
    null;
  // Distance and laps exist only in FIT files: the new file wins if it carries them.
  const distance = data.distance_series ?? streamRow?.distance_series ?? null;
  const laps = data.laps ?? streamRow?.laps ?? null;

  // Scalar fields: the new file only fills the gaps.
  // Moving time: the shortest among saved, file and pauses detected in the streams.
  const moving_time_s = bestMovingTime(
    existing.duration_s,
    existing.moving_time_s,
    data.moving_time_s,
    movingTimeFromStreams(existing.duration_s, { distance, gps }),
  );
  const update: Record<string, unknown> = {
    moving_time_s,
    avg_hr: existing.avg_hr ?? data.avg_hr ?? null,
    max_hr: existing.max_hr ?? data.max_hr ?? null,
    elevation_gain_m: existing.elevation_gain_m ?? data.elevation_gain_m ?? null,
    calories: existing.calories ?? data.calories ?? null,
    rpe: existing.rpe ?? data.rpe ?? null,
    rpe_source: existing.rpe_source ?? data.rpe_source ?? null,
    source_title: existing.source_title ?? data.source_title ?? null,
    notes: existing.notes ?? data.notes ?? null,
    // The same run seen from Intervals.icu: the id is remembered to avoid re-importing it.
    ...(data.external_id ? { external_id: data.external_id } : {}),
  };

  // Pace: if moving time only arrived now, the pace must be recomputed.
  if (moving_time_s != null && moving_time_s !== existing.moving_time_s && existing.distance_m > 0) {
    update.avg_pace_s_km = avgPace(existing.distance_m, moving_time_s);
  }

  // Derived metrics from the combined streams.
  if (hr && hr.length >= 2) {
    update.time_in_zone = timeInZoneFromSeries(hr, ctx.profile);
  }
  if (gps && gps.length >= 2) {
    update.splits = computeSplits(gps, hr ?? undefined);
  }
  const spm = avgCadenceSpm(cadence ?? undefined, data.sport);
  if (spm != null) update.avg_cadence_spm = spm;
  const drift = computeHrDrift(hr ?? undefined, gps ?? undefined);
  if (drift != null) update.hr_drift_pct = drift;

  const { error } = await ctx.supabase
    .from("activities")
    .update(update)
    .eq("id", existing.id)
    .eq("user_id", ctx.userId);
  if (error) throw error;

  if (hr || gps || cadence || distance || laps) {
    await saveStreams(ctx, {
      activity_id: existing.id,
      hr_series: hr,
      gps_series: gps,
      cadence,
      distance_series: distance,
      laps,
    }, "upsert");
  }

  await persistDerived(ctx.supabase, ctx.userId, {
    id: existing.id,
    sport: data.sport,
    started_at: data.started_at,
    distance_m: existing.distance_m,
    duration_s: existing.duration_s,
    moving_time_s,
  }, gps, { gps, hr, distance, laps, cadence });

  const present = (series: unknown) => Array.isArray(series) && series.length > 0;
  const before: EnrichmentSnapshot = {
    hasHr: present(streamRow?.hr_series),
    hasGps: present(streamRow?.gps_series),
    hasDistance: present(streamRow?.distance_series),
    hasLaps: present(streamRow?.laps),
    moving_time_s: existing.moving_time_s,
    avg_hr: existing.avg_hr,
    max_hr: existing.max_hr,
    elevation_gain_m: existing.elevation_gain_m,
    rpe: existing.rpe,
    notes: existing.notes,
  };
  const after: EnrichmentSnapshot = {
    hasHr: present(hr),
    hasGps: present(gps),
    hasDistance: present(distance),
    hasLaps: present(laps),
    moving_time_s: moving_time_s ?? null,
    avg_hr: (update.avg_hr as number | null) ?? null,
    max_hr: (update.max_hr as number | null) ?? null,
    elevation_gain_m: (update.elevation_gain_m as number | null) ?? null,
    rpe: (update.rpe as number | null) ?? null,
    notes: (update.notes as string | null) ?? null,
  };
  return { id: existing.id, substantial: enrichmentIsSubstantial(before, after) };
}
