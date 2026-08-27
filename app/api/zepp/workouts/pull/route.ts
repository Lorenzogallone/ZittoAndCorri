import { authorizeZeppToken } from "@/lib/zepp/data";
import { bearerToken, readJsonWithLimit } from "@/lib/zepp/http";
import { ZeppWorkoutPullRequestSchema } from "@/lib/zepp/schema";
import { pullZeppWorkoutPlan } from "@/lib/zepp/workout-plan";

export async function POST(request: Request): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!token) return Response.json({ error: "Token mancante." }, { status: 401 });
    const connection = await authorizeZeppToken(token, "workout");
    if (!connection) return Response.json({ error: "Token workout non valido o revocato." }, { status: 401 });

    const body = await readJsonWithLimit(request, 32 * 1024);
    const parsed = ZeppWorkoutPullRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Richiesta piano non valida.", details: parsed.error.issues.slice(0, 5) }, { status: 422 });
    }
    return Response.json(await pullZeppWorkoutPlan(connection, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return Response.json({ error: "Richiesta troppo grande." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return Response.json({ error: "JSON non valido." }, { status: 400 });
    }
    console.error("Zepp workout pull:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Sincronizzazione del piano non riuscita." }, { status: 500 });
  }
}
