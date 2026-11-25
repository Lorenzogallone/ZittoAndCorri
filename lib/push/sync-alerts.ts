import "server-only";

// "Stale data" notifications: Intervals.icu sync in error, watch or health data
// stale for more than 48 hours. Only the daily cron sends them
// (/api/cron/daily, once a day on Vercel Hobby): at most one notification a
// day per problem, with no extra state in the database. The tag contains the
// problem and the day, so a second call on the same day replaces the
// notification on the device instead of adding another one. Texts follow the
// language saved on the user's profile.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";
import { loadSyncIssues } from "@/lib/sync-health-data";
import { syncIssuePush, type SyncIssueKind } from "@/lib/sync-health";
import { staticTranslator } from "@/lib/static-translator";
import { loadUserLocales } from "@/lib/push/user-locale";

export interface SyncAlertsSummary {
  users: number;
  alerted: number;
  delivered: number;
  issues: Partial<Record<SyncIssueKind, number>>;
  failed: number;
}

export async function sendSyncAlerts(admin: SupabaseClient, userIds: string[], date: string): Promise<SyncAlertsSummary> {
  const summary: SyncAlertsSummary = { users: userIds.length, alerted: 0, delivered: 0, issues: {}, failed: 0 };
  // No cookie in a cron: the language comes from the profile.
  const locales = await loadUserLocales(admin, userIds);
  for (const userId of userIds) {
    try {
      const locale = locales.get(userId) ?? "it";
      const t = await staticTranslator(locale, "status");
      const issues = await loadSyncIssues(admin, userId);
      let delivered = 0;
      for (const issue of issues) {
        summary.issues[issue.kind] = (summary.issues[issue.kind] ?? 0) + 1;
        delivered += await sendPushToUser(userId, {
          ...syncIssuePush(issue, t, locale),
          url: issue.href,
          tag: `sync-${issue.kind}-${date}`,
        });
      }
      if (delivered) summary.alerted += 1;
      summary.delivered += delivered;
    } catch (error) {
      summary.failed += 1;
      console.error("sync alerts:", userId, error instanceof Error ? error.message : error);
    }
  }
  return summary;
}
