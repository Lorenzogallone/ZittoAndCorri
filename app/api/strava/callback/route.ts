// Route Handler: GET /api/strava/callback — ritorno dall'OAuth Strava.
// Verifica state e sessione, salva token (Vault) e collegamento, poi importa
// in background le attività degli ultimi 14 giorni.

import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STRAVA_STATE_COOKIE } from "@/lib/strava/config";
import { exchangeStravaCode } from "@/lib/strava/tokens";
import { importRecentStravaActivities, saveStravaConnection } from "@/lib/strava/import";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const settings = (status?: string) =>
    `${origin}/settings?focus=strava${status ? `&strava=${status}` : ""}#strava-integration`;
  const redirectTo = (url: string) => {
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: STRAVA_STATE_COOKIE, path: "/api/strava" });
    return response;
  };

  const state = searchParams.get("state");
  const expected = request.cookies.get(STRAVA_STATE_COOKIE)?.value;
  if (!state || !expected || state !== expected) return redirectTo(settings("error"));
  if (searchParams.get("error")) return redirectTo(settings("denied"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectTo(`${origin}/login`);

  const code = searchParams.get("code");
  const scope = searchParams.get("scope");
  // Senza lettura attività (permesso deselezionato) non c'è nulla da importare.
  if (!code || !scope?.includes("activity:read")) return redirectTo(settings("scope"));

  try {
    const token = await exchangeStravaCode(code);
    await saveStravaConnection(user.id, token, scope);
  } catch (error) {
    console.error("Strava callback:", error instanceof Error ? error.message : error);
    return redirectTo(settings("error"));
  }

  const userId = user.id;
  after(() => importRecentStravaActivities(userId));
  return redirectTo(settings());
}
