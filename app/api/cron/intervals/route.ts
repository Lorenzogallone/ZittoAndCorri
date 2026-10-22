// Cron Intervals.icu: importa attività e wellness, pubblica il piano dei
// prossimi 7 giorni, per ogni utente con una chiave salvata.
// Auth: Authorization: Bearer ${CRON_SECRET}. Gira al mattino; la seconda
// esecuzione del giorno è dentro /api/cron/daily (Vercel Hobby: un cron al giorno).

import { cronAuthError } from "@/lib/push/cron-auth";
import { syncAllIntervalsUsers } from "@/lib/intervals/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;
  return Response.json(await syncAllIntervalsUsers());
}
