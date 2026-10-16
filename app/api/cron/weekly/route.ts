// Cron del lunedì: riepilogo della settimana precedente (lunedì–domenica, Roma)
// salvato come messaggio del coach e notificato via push.
// Auth: Authorization: Bearer ${CRON_SECRET} (vedi vercel.json).

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/push/cron-auth";
import { runWeeklyRecap } from "@/lib/push/weekly-recap";
import { previousWeek } from "@/lib/push/weekly-stats";

export const maxDuration = 300;

// Oltre questo tempo gli utenti restanti ricevono il riepilogo senza AI,
// così il cron termina entro maxDuration.
const AI_BUDGET_MS = 200_000;

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const startedAt = Date.now();
  const week = previousWeek();
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id")
    .not("onboarding_completed_at", "is", null)
    .returns<Array<{ id: string }>>();
  if (error) {
    console.error("cron weekly:", error.message);
    return Response.json({ error: "Query non riuscita." }, { status: 500 });
  }

  const counts = { sent: 0, exists: 0, empty: 0, failed: 0, delivered: 0 };
  for (const { id } of profiles ?? []) {
    try {
      const result = await runWeeklyRecap(admin, id, week, {
        allowAi: Date.now() - startedAt < AI_BUDGET_MS,
      });
      counts[result.outcome] += 1;
      counts.delivered += result.delivered;
    } catch (userError) {
      counts.failed += 1;
      console.error("cron weekly user:", id, userError instanceof Error ? userError.message : userError);
    }
  }

  return Response.json({ week_start: week.start, week_end: week.end, users: profiles?.length ?? 0, ...counts });
}
