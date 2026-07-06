// Route Handler: POST /api/import/file — import diretto di un file .fit o
// .gpx come body binario. Pensato per l'automazione da iPhone (Comando Rapido
// nel foglio di condivisione: Zepp/Amazfit → esporta allenamento → condividi
// → POST qui con Bearer api_key). Il formato viene riconosciuto dal contenuto,
// quindi il Comando Rapido non deve distinguere i due casi.
//
// Auth: sessione cookie oppure Authorization: Bearer <api_key> (vedi api-auth).

import type { NextRequest } from "next/server";
import { resolveImportAuth } from "@/lib/ingest/api-auth";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { parseFit } from "@/lib/ingest/adapters/fit";
import type { ActivityInput } from "@/lib/ingest/schema";

/** True se i byte hanno l'header FIT (".FIT" agli offset 8–11). */
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

    // Note opzionali via query (?notes=...) per il Comando Rapido.
    const notes = req.nextUrl.searchParams.get("notes");
    if (notes && notes.trim()) input.notes = notes.trim();

    const id = await ingestActivity(input, ctx);
    return Response.json({ success: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import del file.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
