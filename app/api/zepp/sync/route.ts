import {
  authorizeZeppToken,
  computeCurrentZeppReadiness,
  recentZeppSyncCount,
  storeZeppPayload,
} from "@/lib/zepp/data";
import { bearerToken, readJsonWithLimit, ZEPP_MAX_BODY_BYTES } from "@/lib/zepp/http";
import { ZeppSyncBatchSchema } from "@/lib/zepp/schema";

export async function POST(request: Request): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!token) return Response.json({ error: "Token mancante." }, { status: 401 });
    const connection = await authorizeZeppToken(token);
    if (!connection) return Response.json({ error: "Token non valido o revocato." }, { status: 401 });

    const body = await readJsonWithLimit(request, ZEPP_MAX_BODY_BYTES);
    const parsed = ZeppSyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("Zepp payload rejected:", parsed.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })));
      return Response.json({ error: "Payload Zepp non valido.", details: parsed.error.issues.slice(0, 5) }, { status: 422 });
    }
    const payloads = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    const recentCount = await recentZeppSyncCount(connection.id);
    if (recentCount + payloads.length > 20) {
      return Response.json({ error: "Limite temporaneo di sincronizzazione superato." }, { status: 429 });
    }

    const accepted: string[] = [];
    const duplicates: string[] = [];
    for (const payload of payloads) {
      const duplicate = await storeZeppPayload(connection, payload);
      (duplicate ? duplicates : accepted).push(payload.clientSyncId);
    }
    const readiness = await computeCurrentZeppReadiness(connection.user_id);
    return Response.json({
      accepted,
      duplicates,
      serverTime: new Date().toISOString(),
      readiness: readiness.available ? {
        score: readiness.score,
        status: readiness.status,
        confidence: readiness.confidence,
      } : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return Response.json({ error: "Payload troppo grande (massimo 256 KB)." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return Response.json({ error: "JSON non valido." }, { status: 400 });
    }
    console.error("Zepp sync:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Sincronizzazione non riuscita." }, { status: 500 });
  }
}
