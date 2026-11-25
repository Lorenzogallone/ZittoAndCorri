import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeATLCTL } from "@/lib/metrics/load";
import type { Activity, Profile } from "@/lib/types";
import {
  compactZeppPayloadForAudit,
  normalizeZeppPayload,
  type ZeppDailyMetricWrite,
} from "@/lib/zepp/normalize";
import type { ZeppPairRequest, ZeppSyncPayload } from "@/lib/zepp/schema";
import { computeZeppReadiness } from "@/lib/zepp/readiness";
import { createPairingCode, createZeppToken, hashZeppCredential } from "@/lib/zepp/security";
import {
  findPairingMatch,
  PAIRING_CODE_TTL_MS,
  PAIRING_MAX_ATTEMPTS,
  reservePairingAttempt,
  type PairingCandidate,
  type PairingStore,
} from "@/lib/zepp/pairing";
import type { WellnessDay, ZeppConnectionView, ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { isZeppFresh, ZEPP_DAILY_STALE_DAYS } from "@/lib/zepp/hr-values";

export interface ConnectionRow extends ZeppConnectionView {
  id: string;
  user_id: string;
  token_hash: string | null;
  client_kind: "health" | "workout";
}

interface ExistingMetricRow extends Record<string, unknown> {
  user_id: string;
  connection_id: string;
  date: string;
  captured_at: string;
  completeness: Record<string, boolean> | null;
}

const ARRAY_FIELDS = new Set(["stress_last_week", "hr_zone_ranges"]);
const LEGACY_BULK_FIELDS = [
  "sleep_stages", "naps", "hr_series", "stress_hourly", "spo2_samples",
  "skin_temp_avg_c", "skin_temp_min_c", "skin_temp_max_c", "skin_temp_samples",
  "pai_last_week",
] as const;

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function numericArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(numeric).filter((item): item is number => item != null);
  return values.length ? values : null;
}

function toDailyMetric(row: Record<string, unknown>): ZeppDailyMetric {
  return {
    date: String(row.date),
    captured_at: String(row.captured_at),
    training_load: numeric(row.training_load),
    vo2_max: numeric(row.vo2_max),
    recovery_raw: numeric(row.recovery_raw),
    sleep_score: numeric(row.sleep_score),
    sleep_total_min: numeric(row.sleep_total_min),
    sleep_deep_min: numeric(row.sleep_deep_min),
    sleep_start_min: numeric(row.sleep_start_min),
    sleep_end_min: numeric(row.sleep_end_min),
    nap_total_min: numeric(row.nap_total_min),
    nap_count: numeric(row.nap_count),
    resting_hr: numeric(row.resting_hr),
    max_hr: numeric(row.max_hr),
    stress_avg: numeric(row.stress_avg),
    stress_last_week: numericArray(row.stress_last_week),
    spo2_avg: numeric(row.spo2_avg),
    spo2_min: numeric(row.spo2_min),
    pai_total: numeric(row.pai_total),
    pai_today: numeric(row.pai_today),
    steps: numeric(row.steps),
    step_target: numeric(row.step_target),
    calories: numeric(row.calories),
    calorie_target: numeric(row.calorie_target),
    stand_hours: numeric(row.stand_hours),
    stand_target: numeric(row.stand_target),
    hr_zone_type: numeric(row.hr_zone_type),
    hr_zone_rest: numeric(row.hr_zone_rest),
    hr_zone_ranges: numericArray(row.hr_zone_ranges),
    device_profile: row.device_profile && typeof row.device_profile === "object"
      ? row.device_profile as Record<string, unknown>
      : null,
    completeness: row.completeness && typeof row.completeness === "object"
      ? row.completeness as Record<string, boolean>
      : null,
  };
}

function toWellnessDay(row: Record<string, unknown>): WellnessDay {
  const source = row.source === "zepp" || row.source === "manual" ? row.source : "intervals";
  return {
    date: String(row.date),
    captured_at: String(row.captured_at),
    source,
    sleep_secs: numeric(row.sleep_secs),
    sleep_score: numeric(row.sleep_score),
    resting_hr: numeric(row.resting_hr),
    hrv: numeric(row.hrv),
    spo2: numeric(row.spo2),
    steps: numeric(row.steps),
  };
}

function publicConnection(row: ConnectionRow | null): ZeppConnectionView | null {
  if (!row) return null;
  return {
    enabled: row.enabled,
    auto_sync: row.auto_sync,
    device_name: row.device_name,
    device_source: row.device_source,
    os_version: row.os_version,
    firmware_version: row.firmware_version,
    api_level: row.api_level,
    paired_at: row.paired_at,
    last_sync_at: row.last_sync_at,
    last_error: row.last_error,
  };
}

export async function generatePairingCodeForUser(userId: string): Promise<{ code: string; expiresAt: string }> {
  const admin = createAdminClient();
  await admin.from("zepp_pairing_codes").delete().eq("user_id", userId).is("used_at", null);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    const { error } = await admin.from("zepp_pairing_codes").insert({
      user_id: userId,
      code_hash: hashZeppCredential(code),
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresAt };
    if (error.code !== "23505") throw error;
  }
  throw new Error("Impossibile generare un codice univoco. Riprova.");
}

export async function pairZeppDevice(input: ZeppPairRequest): Promise<{
  token: string;
  connectionId: string;
}> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const codeHash = hashZeppCredential(input.code);
  const store: PairingStore = {
    async listActive(nowIso) {
      const { data, error } = await admin
        .from("zepp_pairing_codes")
        .select("id, user_id, code_hash, attempts, expires_at, used_kinds")
        .gt("expires_at", nowIso)
        .is("used_at", null)
        .lt("attempts", PAIRING_MAX_ATTEMPTS)
        .returns<PairingCandidate[]>();
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, used_kinds: row.used_kinds ?? [] }));
    },
    async bumpAttempts(id, from) {
      const { data, error } = await admin
        .from("zepp_pairing_codes")
        .update({ attempts: from + 1 })
        .eq("id", id)
        .eq("attempts", from)
        .select("id")
        .maybeSingle<{ id: string }>();
      // 23514: check constraint on attempts, the code is already at the limit.
      if (error && error.code !== "23514") throw error;
      return Boolean(data);
    },
  };

  // Each attempt first consumes one attempt on all active codes: the
  // count does not depend on IP or clientId, which the caller controls.
  const reserved = await reservePairingAttempt(store, now);
  const pairing = findPairingMatch(reserved, codeHash, input.clientKind);
  if (!pairing) throw new Error("PAIRING_CODE_INVALID");

  const usedKinds = pairing.used_kinds;
  const newUsedKinds = [...usedKinds, input.clientKind];
  // The code is "exhausted" (used_at set) only when both supported
  // kinds have used it.
  const allKinds: string[] = ["health", "workout"];
  const fullyExhausted = allKinds.every((k) => newUsedKinds.includes(k));

  // Atomic claim for this kind: fails if in the meantime another
  // request already used it (race condition protection). The attempt was
  // already counted in the reservation.
  const { data: claimed, error: claimError } = await admin
    .from("zepp_pairing_codes")
    .update({
      used_kinds: newUsedKinds,
      used_at: fullyExhausted ? now : null,
    })
    .eq("id", pairing.id)
    .not("used_kinds", "cs", `{${input.clientKind}}`)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("PAIRING_CODE_INVALID");

  const token = createZeppToken();
  const { data: connection, error: connectionError } = await admin
    .from("zepp_connections")
    .upsert({
      user_id: pairing.user_id,
      client_kind: input.clientKind,
      token_hash: hashZeppCredential(token),
      enabled: true,
      auto_sync: true,
      device_name: input.device.deviceName ?? "Active 3 Premium",
      device_source: input.device.deviceSource ?? null,
      os_version: input.device.osVersion ?? null,
      firmware_version: input.device.firmwareVersion ?? null,
      api_level: input.device.apiLevel ?? null,
      app_version: input.device.appVersion ?? null,
      paired_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: "user_id,client_kind" })
    .select("id")
    .single<{ id: string }>();
  if (connectionError) throw connectionError;

  return { token, connectionId: connection.id };
}


export async function authorizeZeppToken(
  token: string,
  expectedKind?: "health" | "workout",
): Promise<ConnectionRow | null> {
  if (!token.startsWith("zep_") || token.length < 60) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zepp_connections")
    .select("id, user_id, token_hash, client_kind, enabled, auto_sync, device_name, device_source, os_version, firmware_version, api_level, paired_at, last_sync_at, last_error")
    .eq("token_hash", hashZeppCredential(token))
    .eq("enabled", true)
    .maybeSingle<ConnectionRow>();
  if (error) throw error;
  if (!data || (expectedKind && data.client_kind !== expectedKind)) return null;
  return data;
}

function mergeMetric(existing: ExistingMetricRow | null, incoming: ZeppDailyMetricWrite): Record<string, unknown> {
  if (!existing) return incoming as unknown as Record<string, unknown>;
  const incomingIsNewer = new Date(incoming.captured_at).getTime() >= new Date(existing.captured_at).getTime();
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (key === "completeness") {
      merged[key] = { ...(existing.completeness ?? {}), ...(value as Record<string, boolean>) };
      continue;
    }
    if (ARRAY_FIELDS.has(key)) {
      const oldArray = Array.isArray(existing[key]) ? existing[key] as unknown[] : [];
      const newArray = Array.isArray(value) ? value : [];
      if (newArray.length >= oldArray.length) merged[key] = newArray;
      continue;
    }
    if (key === "captured_at") {
      if (incomingIsNewer) merged[key] = value;
      continue;
    }
    if (incomingIsNewer || existing[key] == null) merged[key] = value;
  }
  merged.updated_at = new Date().toISOString();
  // A new sync also cleans up any bulky data saved by
  // previous versions for the same day.
  for (const field of LEGACY_BULK_FIELDS) merged[field] = null;
  delete merged.id;
  return merged;
}

export async function storeZeppPayload(connection: ConnectionRow, payload: ZeppSyncPayload): Promise<boolean> {
  const admin = createAdminClient();
  const { data: existingEvent, error: duplicateError } = await admin
    .from("zepp_sync_events")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("client_sync_id", payload.clientSyncId)
    .maybeSingle<{ id: string }>();
  if (duplicateError) throw duplicateError;

  let duplicate = Boolean(existingEvent);
  if (!duplicate) {
    const { error: eventError } = await admin.from("zepp_sync_events").insert({
      connection_id: connection.id,
      user_id: connection.user_id,
      client_sync_id: payload.clientSyncId,
      schema_version: payload.schemaVersion,
      trigger: payload.trigger,
      captured_at: payload.capturedAt,
      local_date: payload.localDate,
      timezone_offset_min: payload.timezoneOffsetMinutes,
      raw_payload: compactZeppPayloadForAudit(payload),
    });
    if (eventError?.code === "23505") duplicate = true;
    else if (eventError) throw eventError;
  }

  const normalized = normalizeZeppPayload(payload, connection.user_id, connection.id);
  const { data: existingMetric, error: metricReadError } = await admin
    .from("zepp_daily_metrics")
    .select("*")
    .eq("user_id", connection.user_id)
    .eq("date", payload.localDate)
    .maybeSingle<ExistingMetricRow>();
  if (metricReadError) throw metricReadError;
  const merged = mergeMetric(existingMetric ?? null, normalized);
  const { error: metricError } = await admin
    .from("zepp_daily_metrics")
    .upsert(merged, { onConflict: "user_id,date" });
  if (metricError) throw metricError;

  const { error: connectionError } = await admin.from("zepp_connections").update({
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
    device_name: payload.device.deviceName ?? connection.device_name,
    device_source: payload.device.deviceSource ?? connection.device_source,
    os_version: payload.device.osVersion ?? connection.os_version,
    firmware_version: payload.device.firmwareVersion ?? connection.firmware_version,
    api_level: payload.device.apiLevel ?? connection.api_level,
    ...(payload.device.appVersion ? { app_version: payload.device.appVersion } : {}),
  }).eq("id", connection.id);
  if (connectionError) throw connectionError;
  return duplicate;
}

export async function recentZeppSyncCount(connectionId: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count, error } = await admin
    .from("zepp_sync_events")
    .select("id", { count: "exact", head: true })
    .eq("connection_id", connectionId)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function disableConnection(connection: ConnectionRow): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("zepp_connections").update({
    enabled: false,
    token_hash: null,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  if (error) throw error;
}

export async function disableZeppForUser(
  userId: string,
  clientKind: "health" | "workout" = "health",
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("zepp_connections").update({
    enabled: false,
    token_hash: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("client_kind", clientKind);
  if (error) throw error;
  const { error: pairingError } = await admin
    .from("zepp_pairing_codes")
    .delete()
    .eq("user_id", userId)
    .is("used_at", null);
  if (pairingError) throw pairingError;
}

export async function deleteZeppForUser(
  userId: string,
  clientKind: "health" | "workout" = "health",
): Promise<void> {
  const admin = createAdminClient();
  const { error: connectionError } = await admin.from("zepp_connections").delete()
    .eq("user_id", userId)
    .eq("client_kind", clientKind);
  if (connectionError) throw connectionError;
  const { error: pairingError } = await admin.from("zepp_pairing_codes").delete().eq("user_id", userId);
  if (pairingError) throw pairingError;
}

export async function getZeppDashboard(
  supabase: SupabaseClient,
  userId: string,
  internal: ReturnType<typeof computeATLCTL>,
): Promise<{
  connection: ZeppConnectionView | null;
  latest: ZeppDailyMetric | null;
  recent: ZeppDailyMetric[];
  readiness: ZeppReadinessResult;
  /** True if Zepp is active but has not synced for more than ZEPP_DAILY_STALE_DAYS. */
  stale: boolean;
  /** Recent wellness (Intervals.icu), newest first; empty without migration 0025. */
  wellness: WellnessDay[];
}> {
  const [{ data: connectionData }, { data: metricData }, wellnessResult] = await Promise.all([
    supabase.from("zepp_connections")
      .select("id, user_id, token_hash, client_kind, enabled, auto_sync, device_name, device_source, os_version, firmware_version, api_level, paired_at, last_sync_at, last_error")
      .eq("user_id", userId)
      .eq("client_kind", "health")
      .maybeSingle<ConnectionRow>(),
    supabase.from("zepp_daily_metrics")
      .select("date, captured_at, training_load, vo2_max, recovery_raw, sleep_score, sleep_total_min, sleep_deep_min, sleep_start_min, sleep_end_min, nap_total_min, nap_count, resting_hr, max_hr, stress_avg, stress_last_week, spo2_avg, spo2_min, pai_total, pai_today, steps, step_target, calories, calorie_target, stand_hours, stand_target, hr_zone_type, hr_zone_rest, hr_zone_ranges, device_profile, completeness")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(42)
      .returns<Record<string, unknown>[]>(),
    supabase.from("wellness_daily")
      .select("date, captured_at, source, sleep_secs, sleep_score, resting_hr, hrv, spo2, steps")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(42)
      .returns<Record<string, unknown>[]>(),
  ]);
  const connection = publicConnection(connectionData ?? null);
  // Without migration 0025 the table does not exist: we go on without wellness.
  const wellnessAll = wellnessResult.error ? [] : (wellnessResult.data ?? []).map(toWellnessDay);
  const wellness = wellnessAll.length && isZeppFresh(wellnessAll[0].captured_at, ZEPP_DAILY_STALE_DAYS) ? wellnessAll : [];
  const all = (metricData ?? []).map(toDailyMetric);
  // If the watch has not synced for a few days its data no longer describes
  // the athlete: they are ignored and we fall back to the internal calculation only.
  const stale = all.length > 0 && !isZeppFresh(all[0].captured_at, ZEPP_DAILY_STALE_DAYS);
  const metrics = stale ? [] : all;
  const enabled = Boolean(connection?.enabled);
  return {
    connection,
    latest: enabled ? metrics[0] ?? null : null,
    recent: enabled ? metrics : [],
    readiness: computeZeppReadiness(metrics, internal, new Date(), enabled, wellness),
    stale: enabled && stale,
    wellness,
  };
}

export async function computeCurrentZeppReadiness(userId: string): Promise<ZeppReadinessResult> {
  const admin = createAdminClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: activities }, { data: profile }] = await Promise.all([
    admin.from("activities")
      .select("started_at, duration_s, moving_time_s, rpe, avg_hr, time_in_zone, sport")
      .eq("user_id", userId)
      .is("excluded_at", null)
      .gte("started_at", since)
      .returns<Array<Pick<Activity, "started_at" | "duration_s" | "moving_time_s" | "rpe" | "avg_hr" | "time_in_zone" | "sport">>>(),
    admin.from("profiles").select("max_hr, resting_hr").eq("id", userId)
      .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
  ]);
  const effectiveHr = await getEffectiveHrConfig(admin, userId, profile ?? null);
  const internal = computeATLCTL((activities ?? []).map((activity) => ({
    started_at: activity.started_at,
    duration_s: activity.moving_time_s ?? activity.duration_s,
    rpe: activity.rpe,
    avg_hr: activity.avg_hr,
    time_in_zone: activity.time_in_zone,
    sport: activity.sport,
  })), today, effectiveHr);
  return (await getZeppDashboard(admin, userId, internal)).readiness;
}
