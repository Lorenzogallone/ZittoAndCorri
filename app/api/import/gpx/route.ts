// Route Handler: POST /api/import/gpx — GPX as a string in a JSON body
// ({ gpx, notes? }). Auth: cookie session or Authorization: Bearer
// <api_key> (see lib/ingest/api-auth). To send the binary file
// directly (.fit or .gpx) use /api/import/file.

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { enqueueEvaluationAfterIngest } from "@/lib/ai/evaluate-activity";

export const maxDuration = 240;

export async function POST(req: NextRequest) {
  const ctx = await resolveImportAuth(req);
  if (!ctx) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let body: { gpx?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const gpxText = body.gpx;
  if (!gpxText || typeof gpxText !== "string" || gpxText.trim() === "") {
    return Response.json({ error: "File GPX non fornito." }, { status: 400 });
  }

  try {
    const input = parseGpx(gpxText);

    // Override notes if provided in the request body.
    if (body.notes) {
      input.notes = body.notes;
    }

    const outcome = await ingestActivity(input, ctx);
    const activityId = outcome.id;
    const evaluationJobId = await enqueueEvaluationAfterIngest(ctx.userId, outcome);
    return Response.json({ success: true, id: activityId, evaluationJobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import del GPX.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
