"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { claimIntervalsImport } from "@/lib/intervals/credentials";
import { runIntervalsSync } from "@/lib/intervals/sync";

export interface RefreshResult {
  /** New runs arrived from the watch (via Intervals.icu). */
  imported: number;
  /** The import is still running: the runs arrive with the next refresh. */
  stillSyncing?: boolean;
  error?: string;
}

/** Two close reloads don't redo the import. */
const MIN_INTERVAL_MS = 60_000;
/** Beyond this time the page reloads anyway; the import finishes later. */
const WAIT_MS = 12_000;

/**
 * Pull-down and «Refresh» button: immediately imports the watch's runs and wellness
 * data (Zepp → Intervals.icu) instead of waiting for the cron or the run
 * on open, which happens after the response and so isn't visible in the page
 * just loaded. New runs start the AI analysis on their own. At the end
 * `refresh()` refetches the page data in the same response.
 *
 * The Zepp app's sync with the watch can't be started from here:
 * it is the app on the phone that sends the data when it connects to the watch.
 */
export async function refreshAppData(): Promise<RefreshResult> {
  const result = await syncFromWatch();
  refresh();
  return result;
}

async function syncFromWatch(): Promise<RefreshResult> {
  const t = await getTranslations("home.refresh");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { imported: 0 };

  try {
    const connection = await claimIntervalsImport(user.id, MIN_INTERVAL_MS);
    if (!connection || !(connection.import_activities || connection.import_wellness)) return { imported: 0 };

    const sync = runIntervalsSync(user.id, connection, { publish: false });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
    const result = await Promise.race([sync, timeout]);
    if (!result) {
      after(() => sync.then(() => undefined, (error) => {
        console.error("refreshAppData:", error instanceof Error ? error.message : error);
      }));
      return { imported: 0, stillSyncing: true };
    }
    return {
      imported: result.import?.activities.imported ?? 0,
      error: result.error ? t("syncFailed") : undefined,
    };
  } catch (error) {
    console.error("refreshAppData:", error instanceof Error ? error.message : error);
    return { imported: 0, error: t("syncFailed") };
  }
}
