import { authorizeZeppToken, disableConnection } from "@/lib/zepp/data";
import { bearerToken } from "@/lib/zepp/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!token) return Response.json({ error: "Token mancante." }, { status: 401 });
    const connection = await authorizeZeppToken(token);
    if (!connection) return Response.json({ error: "Token non valido o già revocato." }, { status: 401 });
    await disableConnection(connection);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Zepp disconnect:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Disconnessione non riuscita." }, { status: 500 });
  }
}
