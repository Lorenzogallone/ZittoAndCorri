// Route Handler: POST /api/import/gpx — GPX come stringa in un body JSON
// ({ gpx, notes? }). Auth: sessione cookie oppure Authorization: Bearer
// <api_key> (vedi lib/ingest/api-auth). Per mandare direttamente il file
// binario (.fit o .gpx) usa /api/import/file.

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { enqueueActivityEvaluationSafely } from "@/lib/ai/evaluate-activity";

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

    // Override delle note se fornite nel body della richiesta.
    if (body.notes) {
      input.notes = body.notes;
    }

    const activityId = await ingestActivity(input, ctx);
    const evaluationJobId = await enqueueActivityEvaluationSafely(ctx.userId, activityId);
    return Response.json({ success: true, id: activityId, evaluationJobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import del GPX.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
