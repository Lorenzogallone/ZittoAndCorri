// Cron Intervals.icu: importa attività e wellness e pubblica il piano futuro,
// per ogni utente con una chiave salvata. Con ?scope=import salta la
// pubblicazione: lo usa il giro orario di GitHub Actions
// (.github/workflows/intervals-import.yml), perché Vercel Hobby concede un solo
// cron al giorno. Auth: Authorization: Bearer ${CRON_SECRET}.

import { cronAuthError } from "@/lib/push/cron-auth";
import { syncAllIntervalsUsers } from "@/lib/intervals/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;
  const scope = new URL(request.url).searchParams.get("scope");
  return Response.json(await syncAllIntervalsUsers({ publish: scope !== "import" }));
}
