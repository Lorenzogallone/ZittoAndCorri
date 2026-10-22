import "server-only";

// Import da Intervals.icu: attività (FIT generato da Intervals, con GPS e FC)
// e wellness giornaliero (sonno, FC a riposo, HRV, SpO2, passi). Idempotente:
// le attività già presenti (external_id) vengono saltate, il wellness è un
// upsert per giorno e sorgente.

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseFit } from "@/lib/ingest/adapters/fit";
import { enqueueActivityEvaluationSafely } from "@/lib/ai/evaluate-activity";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { isoDateShift } from "@/lib/dates";
import type { Profile } from "@/lib/types";
import {
  downloadFitFile,
  IntervalsError,
  listActivities,
  listWellness,
  type IntervalsActivity,
  type IntervalsClient,
  type IntervalsWellness,
} from "@/lib/intervals/client";

export interface IntervalsImportSummary {
  activities: { seen: number; imported: number; skipped: number; failed: number };
  wellness: { days: number };
  errors: string[];
}

/** Finestra di ricerca: le attività Zepp possono arrivare con qualche giorno di ritardo. */
const ACTIVITY_LOOKBACK_DAYS = 28;
const WELLNESS_LOOKBACK_DAYS = 45;
const MAX_ACTIVITIES_PER_RUN = 20;

export function intervalsActivityExternalId(activity: Pick<IntervalsActivity, "id">): string {
  return `intervals:${activity.id}`;
}

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function integer(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function decimal(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Riga wellness_daily da un giorno Intervals.icu; null se non porta niente. */
export function wellnessRow(day: IntervalsWellness, userId: string) {
  const row = {
    user_id: userId,
    date: day.id,
    source: "intervals" as const,
    captured_at: day.updated && !Number.isNaN(Date.parse(day.updated)) ? new Date(day.updated).toISOString() : new Date().toISOString(),
    sleep_secs: integer(day.sleepSecs),
    sleep_score: decimal(day.sleepScore),
    resting_hr: integer(day.restingHR),
    hrv: decimal(day.hrv),
    hrv_sdnn: decimal(day.hrvSDNN),
    spo2: decimal(day.spO2),
    steps: integer(day.steps),
    stress: decimal(day.stress),
    readiness: decimal(day.readiness),
    vo2max: decimal(day.vo2max),
    weight_kg: decimal(day.weight),
    updated_at: new Date().toISOString(),
  };
  const informative = [row.sleep_secs, row.sleep_score, row.resting_hr, row.hrv, row.hrv_sdnn, row.spo2, row.steps, row.stress, row.readiness, row.vo2max, row.weight_kg]
    .some((value) => value != null);
  return informative && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row : null;
}

async function importWellness(client: IntervalsClient, userId: string, summary: IntervalsImportSummary): Promise<void> {
  const today = romeToday();
  const days = await listWellness(client, isoDateShift(today, -WELLNESS_LOOKBACK_DAYS), today);
  const rows = days.map((day) => wellnessRow(day, userId)).filter((row): row is NonNullable<typeof row> => row != null);
  if (!rows.length) return;
  const admin = createAdminClient();
  const { error } = await admin.from("wellness_daily").upsert(rows, { onConflict: "user_id,date,source" });
  if (error) throw error;
  summary.wellness.days = rows.length;
}

async function importActivities(client: IntervalsClient, userId: string, summary: IntervalsImportSummary): Promise<void> {
  const today = romeToday();
  const activities = await listActivities(client, isoDateShift(today, -ACTIVITY_LOOKBACK_DAYS), isoDateShift(today, 1));
  summary.activities.seen = activities.length;
  if (!activities.length) return;

  const admin = createAdminClient();
  const ids = activities.map(intervalsActivityExternalId);
  const { data: known, error: knownError } = await admin
    .from("activities")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", ids)
    .returns<Array<{ external_id: string }>>();
  if (knownError) throw knownError;
  const alreadyImported = new Set((known ?? []).map((row) => row.external_id));

  const { data: profile } = await admin
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(admin, userId, profile ?? null);
  const ctx = {
    supabase: admin,
    userId,
    profile: { max_hr: effectiveHr.max_hr, resting_hr: effectiveHr.resting_hr, hr_zone_ranges: effectiveHr.hr_zone_ranges },
  };

  // Dalla più vecchia alla più recente, così gli import parziali restano coerenti.
  const pending = activities
    .filter((activity) => !alreadyImported.has(intervalsActivityExternalId(activity)))
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
    .slice(0, MAX_ACTIVITIES_PER_RUN);
  summary.activities.skipped = activities.length - pending.length;

  for (const activity of pending) {
    try {
      const fit = await downloadFitFile(client, activity.id);
      const input = await parseFit(fit);
      input.source = "intervals";
      input.external_id = intervalsActivityExternalId(activity);
      if (activity.name && !input.source_title) input.source_title = activity.name;
      const activityId = await ingestActivity(input, ctx);
      await enqueueActivityEvaluationSafely(userId, activityId);
      summary.activities.imported += 1;
    } catch (error) {
      summary.activities.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`Attività ${activity.id}: ${message}`);
      console.error("Intervals import activity:", activity.id, message);
    }
  }
}

/**
 * Importa attività e wellness per un utente. Non lancia: gli errori finiscono
 * nel riepilogo, così il cron può passare all'utente successivo.
 */
export async function importFromIntervals(
  client: IntervalsClient,
  userId: string,
  options: { activities: boolean; wellness: boolean },
): Promise<IntervalsImportSummary> {
  const summary: IntervalsImportSummary = {
    activities: { seen: 0, imported: 0, skipped: 0, failed: 0 },
    wellness: { days: 0 },
    errors: [],
  };
  if (options.wellness) {
    try {
      await importWellness(client, userId, summary);
    } catch (error) {
      summary.errors.push(`Wellness: ${describe(error)}`);
    }
  }
  if (options.activities) {
    try {
      await importActivities(client, userId, summary);
    } catch (error) {
      summary.errors.push(`Attività: ${describe(error)}`);
    }
  }
  return summary;
}

export function describe(error: unknown): string {
  if (error instanceof IntervalsError) {
    if (error.status === 401 || error.status === 403) return "chiave Intervals.icu non valida o revocata";
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
