import "server-only";

// One full pass for a user: import (activities, wellness) and publishing
// of the plan. Used by the cron and the "Sync now" button in settings.

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimIntervalsImport,
  getIntervalsApiKey,
  INTERVALS_COLUMNS,
  listIntervalsUsers,
  markIntervalsSync,
  type IntervalsConnectionView,
} from "@/lib/intervals/credentials";
import { describe, importFromIntervals, type IntervalsImportSummary } from "@/lib/intervals/import";
import { publishPlanToIntervals, type IntervalsPublishSummary } from "@/lib/intervals/publish";
import { refreshTimeInZones } from "@/lib/ingest/zone-refresh";
import { nextIntervalsError } from "@/lib/intervals/sync-errors";

export interface IntervalsSyncResult {
  import: IntervalsImportSummary | null;
  publish: IntervalsPublishSummary | null;
  error: string | null;
}

export async function runIntervalsSync(
  userId: string,
  connection: IntervalsConnectionView,
  options: { import?: boolean; publish?: boolean } = {},
): Promise<IntervalsSyncResult> {
  const apiKey = await getIntervalsApiKey(userId);
  if (!apiKey) {
    const error = "Chiave Intervals.icu assente.";
    await markIntervalsSync(userId, { last_error: error });
    return { import: null, publish: null, error };
  }
  const client = { apiKey, athleteId: connection.athlete_id };
  const result: IntervalsSyncResult = { import: null, publish: null, error: null };
  const errors: string[] = [];
  const now = new Date().toISOString();
  const importRan = options.import !== false && (connection.import_activities || connection.import_wellness);
  const publishRan = options.publish !== false;

  // last_import_at and last_publish_at only mark successful passes; errors
  // stay in last_error until the same part succeeds again.
  // Exception: the import on PWA open books last_import_at before
  // starting (claimIntervalsImport), to avoid launching two at once.
  if (importRan) {
    result.import = await importFromIntervals(client, userId, {
      activities: connection.import_activities,
      wellness: connection.import_wellness,
    });
    errors.push(...result.import.errors);
    if (!result.import.errors.length) await markIntervalsSync(userId, { last_import_at: now });
  }

  // Full pass (morning cron, "Sync now"): realigns the time in
  // zone of saved runs to the current zones, if they changed in the meantime.
  if (publishRan) {
    try {
      await refreshTimeInZones(createAdminClient(), userId);
    } catch (error) {
      errors.push(`Zone: ${describe(error)}`);
    }
  }

  if (options.publish !== false && connection.publish_plan) {
    try {
      result.publish = await publishPlanToIntervals(client, userId, connection.target_preference);
      errors.push(...result.publish.errors);
      if (!result.publish.errors.length) await markIntervalsSync(userId, { last_publish_at: now });
    } catch (error) {
      errors.push(`Piano: ${describe(error)}`);
    }
  }

  result.error = errors.length ? errors.slice(0, 3).join(" · ") : null;
  const lastError = nextIntervalsError(connection.last_error, { importRan, publishRan, errors });
  if (lastError !== connection.last_error) await markIntervalsSync(userId, { last_error: lastError });
  return result;
}

/** Pass for all users with a saved key (cron). One error doesn't stop the others. */
export async function syncAllIntervalsUsers(options: { publish?: boolean } = {}) {
  const users = await listIntervalsUsers();
  const results: Array<{ user: string; imported: number; wellnessDays: number; published: number; error: string | null }> = [];
  for (const user of users) {
    try {
      const result = await runIntervalsSync(user.user_id, user, { publish: options.publish });
      results.push({
        user: user.user_id,
        imported: result.import?.activities.imported ?? 0,
        wellnessDays: result.import?.wellness.days ?? 0,
        published: (result.publish?.created ?? 0) + (result.publish?.updated ?? 0),
        error: result.error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("cron intervals:", user.user_id, message);
      results.push({ user: user.user_id, imported: 0, wellnessDays: 0, published: 0, error: message });
      await markIntervalsSync(user.user_id, { last_error: `Sincronizzazione: ${message}`.slice(0, 500) });
    }
  }
  const failed = results.filter((result) => result.error).length;
  // HTTP status stays 200 (the scheduler must not retry): the real outcome is here.
  return { ok: failed === 0, users: users.length, failed, results };
}

/** Minimum interval between two imports launched by opening the PWA. */
export const IMPORT_ON_OPEN_MIN_MS = 10 * 60_000;

/**
 * On PWA open: if the last import is older than 10 minutes,
 * imports runs and wellness from Intervals.icu after the response is sent. The
 * run just done shows up at the first page refresh, without waiting for the
 * cron. Doesn't republish the plan.
 */
export function scheduleIntervalsImportIfStale(userId: string): void {
  after(async () => {
    try {
      const connection = await claimIntervalsImport(userId, IMPORT_ON_OPEN_MIN_MS);
      if (!connection || !(connection.import_activities || connection.import_wellness)) return;
      await runIntervalsSync(userId, connection, { publish: false });
    } catch (error) {
      console.error("scheduleIntervalsImportIfStale:", error instanceof Error ? error.message : error);
    }
  });
}

/**
 * After a plan change: republishes all future sessions to Intervals.icu
 * after the response is sent, so the watch gets the new version at the next
 * Zepp round (about three times a day) without waiting for the cron.
 */
export function schedulePlanPublish(userId: string): void {
  after(async () => {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("user_intervals_credentials")
        .select(INTERVALS_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle<IntervalsConnectionView>();
      if (!data?.publish_plan) return;
      await runIntervalsSync(userId, data, { import: false });
    } catch (error) {
      console.error("schedulePlanPublish:", error instanceof Error ? error.message : error);
    }
  });
}
