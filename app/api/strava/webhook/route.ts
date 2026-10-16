// Route Handler: /api/strava/webhook — sottoscrizione push di Strava.
// GET: validazione della sottoscrizione (hub.challenge).
// POST: eventi; Strava vuole 200 entro 2 s, quindi il lavoro va in after().

import { after, type NextRequest } from "next/server";
import { getStravaConfig } from "@/lib/strava/config";
import {
  findUserByAthlete,
  handleStravaDeauthorization,
  importStravaActivityForWebhook,
} from "@/lib/strava/import";

export const maxDuration = 300;

interface StravaEvent {
  object_type?: string;
  object_id?: number;
  aspect_type?: string;
  owner_id?: number;
  updates?: Record<string, string>;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = getStravaConfig()?.verifyToken;
  const challenge = params.get("hub.challenge");
  if (
    params.get("hub.mode") !== "subscribe" ||
    !verifyToken ||
    params.get("hub.verify_token") !== verifyToken ||
    !challenge
  ) {
    return Response.json({ error: "Verifica non valida." }, { status: 403 });
  }
  return Response.json({ "hub.challenge": challenge });
}

export async function POST(request: Request) {
  let event: StravaEvent;
  try {
    event = (await request.json()) as StravaEvent;
  } catch {
    return Response.json({ error: "JSON non valido." }, { status: 400 });
  }
  if (!getStravaConfig() || typeof event.owner_id !== "number") {
    return Response.json({ ok: true });
  }

  const ownerId = event.owner_id;
  after(async () => {
    try {
      const userId = await findUserByAthlete(ownerId);
      if (!userId) return; // atleta sconosciuto: ignorato

      if (
        event.object_type === "activity" &&
        event.aspect_type === "create" &&
        typeof event.object_id === "number"
      ) {
        await importStravaActivityForWebhook(userId, event.object_id);
      } else if (event.object_type === "athlete" && event.updates?.authorized === "false") {
        await handleStravaDeauthorization(userId);
      }
    } catch (error) {
      console.error("Strava webhook:", error);
    }
  });

  return Response.json({ ok: true });
}
