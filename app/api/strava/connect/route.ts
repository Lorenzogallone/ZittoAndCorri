// Route Handler: GET /api/strava/connect — avvia l'OAuth Strava. Richiede la
// sessione cookie; lo state anti-CSRF vive in un cookie httpOnly di 10 minuti.

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStravaConfig, STRAVA_STATE_COOKIE } from "@/lib/strava/config";

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const config = getStravaConfig();
  if (!config) return NextResponse.redirect(`${origin}/settings`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/strava/callback`,
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STRAVA_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/strava",
  });
  return response;
}
