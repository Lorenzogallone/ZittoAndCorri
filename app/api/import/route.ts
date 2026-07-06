// Route Handler: POST /api/import. PLAN.md §6.
// Body: un ActivityInput JSON (o un array). Auth: sessione cookie oppure
// Authorization: Bearer <api_key> (vedi lib/ingest/api-auth).

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";

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
    for (const inp of inputs) {
      ids.push(await ingestActivity(inp, ctx));
    }
    return Response.json(ids.length === 1 ? { id: ids[0] } : { ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
