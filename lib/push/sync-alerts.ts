import "server-only";

// Notifiche "dati fermi": sincronizzazione Intervals.icu in errore, orologio o
// dati salute fermi da più di 48 ore. Le manda solo il cron giornaliero
// (/api/cron/daily, una volta al giorno su Vercel Hobby): al massimo una
// notifica al giorno per problema senza stato in più nel database. Il tag
// contiene problema e giorno, così un'eventuale seconda chiamata dello stesso
// giorno sostituisce la notifica sul dispositivo invece di aggiungerne un'altra.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";
import { loadSyncIssues } from "@/lib/sync-health-data";
import { syncIssuePush, type SyncIssueKind } from "@/lib/sync-health";
import { staticTranslator } from "@/lib/static-translator";

export interface SyncAlertsSummary {
  users: number;
  alerted: number;
  delivered: number;
  issues: Partial<Record<SyncIssueKind, number>>;
  failed: number;
}

export async function sendSyncAlerts(admin: SupabaseClient, userIds: string[], date: string): Promise<SyncAlertsSummary> {
  const summary: SyncAlertsSummary = { users: userIds.length, alerted: 0, delivered: 0, issues: {}, failed: 0 };
  // Il cron non ha la lingua dell'utente (nessun cookie): le notifiche escono in italiano.
  const t = await staticTranslator("it", "status");
  for (const userId of userIds) {
    try {
      const issues = await loadSyncIssues(admin, userId);
      let delivered = 0;
      for (const issue of issues) {
        summary.issues[issue.kind] = (summary.issues[issue.kind] ?? 0) + 1;
        delivered += await sendPushToUser(userId, {
          ...syncIssuePush(issue, t, "it"),
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
