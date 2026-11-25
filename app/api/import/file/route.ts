// Route Handler: POST /api/import/file — direct import of a .fit or
// .gpx file as a binary body. Meant for automation from iPhone (Shortcut
// in the share sheet: Zepp/Amazfit → export workout → share
// → POST here with Bearer api_key). The format is recognized from the content,
// so the Shortcut doesn't have to tell the two cases apart.
//
// Auth: session cookie or Authorization: Bearer <api_key> (see api-auth).

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { parseFit } from "@/lib/ingest/adapters/fit";
import type { ActivityInput } from "@/lib/ingest/schema";
import { enqueueEvaluationAfterIngest } from "@/lib/ai/evaluate-activity";

export const maxDuration = 240;

/** True if the bytes have the FIT header (".FIT" at offsets 8–11). */
function looksLikeFit(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[8] === 0x2e && // .
    bytes[9] === 0x46 && // F
    bytes[10] === 0x49 && // I
    bytes[11] === 0x54 // T
  );
}

export async function POST(req: NextRequest) {
  const ctx = await resolveImportAuth(req);
  if (!ctx) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return Response.json({ error: "Body vuoto: manda il file .fit o .gpx." }, { status: 400 });
  }
  if (buf.byteLength > 25 * 1024 * 1024) {
    return Response.json({ error: "File troppo grande (max 25 MB)." }, { status: 413 });
  }

  try {
    let input: ActivityInput;
    if (looksLikeFit(new Uint8Array(buf))) {
      input = await parseFit(buf);
    } else {
      const text = new TextDecoder("utf-8").decode(buf);
      if (!text.includes("<gpx")) {
        return Response.json(
          { error: "Formato non riconosciuto: serve un file .fit o .gpx." },
          { status: 422 },
        );
      }
      input = parseGpx(text);
    }

    // Optional notes via query (?notes=...) for the Shortcut.
    const notes = req.nextUrl.searchParams.get("notes");
    if (notes && notes.trim()) input.notes = notes.trim();

    const outcome = await ingestActivity(input, ctx);
    const id = outcome.id;
    const evaluationJobId = await enqueueEvaluationAfterIngest(ctx.userId, outcome);
    return Response.json({ success: true, id, evaluationJobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import del file.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
