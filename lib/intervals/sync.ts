import "server-only";

// Un giro completo per un utente: import (attività, wellness) e pubblicazione
// del piano. Usato dal cron e dal pulsante "Sincronizza ora" nelle impostazioni.

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getIntervalsApiKey,
  INTERVALS_COLUMNS,
  listIntervalsUsers,
  markIntervalsSync,
  type IntervalsConnectionView,
} from "@/lib/intervals/credentials";
import { describe, importFromIntervals, type IntervalsImportSummary } from "@/lib/intervals/import";
import { publishPlanToIntervals, type IntervalsPublishSummary } from "@/lib/intervals/publish";

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
  if (!apiKey) return { import: null, publish: null, error: "Chiave Intervals.icu assente." };
  const client = { apiKey, athleteId: connection.athlete_id };
  const result: IntervalsSyncResult = { import: null, publish: null, error: null };
  const errors: string[] = [];
  const now = new Date().toISOString();

  if (options.import !== false && (connection.import_activities || connection.import_wellness)) {
    result.import = await importFromIntervals(client, userId, {
      activities: connection.import_activities,
      wellness: connection.import_wellness,
    });
    errors.push(...result.import.errors);
    await markIntervalsSync(userId, { last_import_at: now });
  }

  if (options.publish !== false && connection.publish_plan) {
    try {
      result.publish = await publishPlanToIntervals(client, userId, connection.target_preference);
      errors.push(...result.publish.errors);
      await markIntervalsSync(userId, { last_publish_at: now });
    } catch (error) {
      errors.push(`Piano: ${describe(error)}`);
    }
  }

  result.error = errors.length ? errors.slice(0, 3).join(" · ") : null;
  await markIntervalsSync(userId, { last_error: result.error });
  return result;
}

/** Giro per tutti gli utenti con una chiave salvata (cron). Un errore non ferma gli altri. */
export async function syncAllIntervalsUsers() {
  const users = await listIntervalsUsers();
  const results: Array<{ user: string; imported: number; wellnessDays: number; published: number; error: string | null }> = [];
  for (const user of users) {
    try {
      const result = await runIntervalsSync(user.user_id, user);
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
    }
  }
  return { users: users.length, results };
}

/**
 * Dopo una modifica al piano: ripubblica i prossimi 7 giorni su Intervals.icu
 * a risposta già inviata, così l'orologio riceve la versione nuova al prossimo
 * giro di Zepp (circa tre volte al giorno) senza aspettare il cron.
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
