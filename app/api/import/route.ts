// Route Handler: POST /api/import. PLAN.md §6.
// Body: an ActivityInput JSON (or an array). Auth: cookie session or
// Authorization: Bearer <api_key> (see lib/ingest/api-auth).

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";
import { enqueueEvaluationAfterIngest } from "@/lib/ai/evaluate-activity";

export const maxDuration = 240;

export async function POST(req: NextRequest) {
  const ctx = await resolveImportAuth(req);
  if (!ctx) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const inputs = Array.isArray(body) ? body : [body];

  try {
    const ids: string[] = [];
    const evaluationJobIds: string[] = [];
    for (const inp of inputs) {
      const outcome = await ingestActivity(inp, ctx);
      ids.push(outcome.id);
      const jobId = await enqueueEvaluationAfterIngest(ctx.userId, outcome);
      if (jobId) evaluationJobIds.push(jobId);
    }
    return Response.json(ids.length === 1
      ? { id: ids[0], evaluationJobId: evaluationJobIds[0] ?? null }
      : { ids, evaluationJobIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
