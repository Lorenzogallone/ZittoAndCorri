// Intervals.icu cron: imports activities and wellness and publishes the future
// plan, for every user with a saved key. With ?scope=import it skips
// publishing: the hourly GitHub Actions run uses it
// (.github/workflows/intervals-import.yml), because Vercel Hobby allows only
// one cron a day. Auth: Authorization: Bearer ${CRON_SECRET}.
// The status stays 200 even with errors (GitHub Actions and Vercel must not
// retry): the body says `ok`, how many users failed and why.

import { cronAuthError } from "@/lib/push/cron-auth";
import { syncAllIntervalsUsers } from "@/lib/intervals/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;
  const scope = new URL(request.url).searchParams.get("scope");
  try {
    return Response.json(await syncAllIntervalsUsers({ publish: scope !== "import" }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("cron intervals:", message);
    return Response.json({ ok: false, users: 0, failed: 0, results: [], error: message });
  }
}
