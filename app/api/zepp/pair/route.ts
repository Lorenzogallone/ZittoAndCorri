import { pairZeppDevice } from "@/lib/zepp/data";
import { clearPairingAttempts, consumePairingAttempt, readJsonWithLimit } from "@/lib/zepp/http";
import { ZeppPairRequestSchema } from "@/lib/zepp/schema";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonWithLimit(request, 16 * 1024);
    const parsed = ZeppPairRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Richiesta di collegamento non valida." }, { status: 400 });

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const attemptKey = `${forwarded}:${parsed.data.clientId}`;
    if (!consumePairingAttempt(attemptKey)) {
      return Response.json({ error: "Troppi tentativi. Riprova fra dieci minuti." }, { status: 429 });
    }

    try {
      const result = await pairZeppDevice(parsed.data);
      clearPairingAttempts(attemptKey);
      return Response.json({
        accessToken: result.token,
        connectionId: result.connectionId,
        schedule: parsed.data.clientKind === "workout"
          ? { morning: "06:00", evening: "18:00" }
          : { morning: "08:00", evening: "23:00" },
        readinessEnabled: parsed.data.clientKind === "health",
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PAIRING_CODE_INVALID") {
        return Response.json({ error: "Codice non valido, scaduto o già usato." }, { status: 401 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return Response.json({ error: "Richiesta troppo grande." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return Response.json({ error: "JSON non valido." }, { status: 400 });
    }
    console.error("Zepp pair:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Collegamento non riuscito." }, { status: 500 });
  }
}
