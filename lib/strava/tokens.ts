import "server-only";

// Token OAuth Strava: scambio del code, refresh e persistenza cifrata in
// Vault tramite le RPC security definer della migration 0020.

import { createAdminClient } from "@/lib/supabase/admin";
import { getStravaConfig } from "./config";
import { StravaAuthError, StravaError, StravaRateLimitError } from "./api";

const OAUTH_URL = "https://www.strava.com/oauth/token";
/** Refresh anticipato: il token viene rinnovato se scade entro 5 minuti. */
const REFRESH_MARGIN_S = 5 * 60;

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch in secondi. */
  expires_at: number;
}

export interface StravaAthlete {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
}

export interface StravaTokenResponse extends StravaTokens {
  athlete?: StravaAthlete;
}

async function requestToken(params: Record<string, string>): Promise<StravaTokenResponse> {
  const config = getStravaConfig();
  if (!config) throw new StravaError("Strava non configurato.");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    }),
  });
  if (res.status === 429) throw new StravaRateLimitError();
  // 400/401: code o refresh token non più validi (accesso revocato).
  if (res.status === 400 || res.status === 401) throw new StravaAuthError(res.status);
  if (!res.ok) throw new StravaError(`Strava OAuth ha risposto ${res.status}.`, res.status);
  const body = (await res.json()) as Partial<StravaTokenResponse>;
  if (!body.access_token || !body.refresh_token || !body.expires_at) {
    throw new StravaError("Risposta OAuth Strava incompleta.");
  }
  return body as StravaTokenResponse;
}

/** Scambia il code del callback OAuth con i token (+ atleta). */
export function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  return requestToken({ code, grant_type: "authorization_code" });
}

export async function storeStravaTokens(userId: string, tokens: StravaTokens): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_strava_tokens", {
    p_user_id: userId,
    p_secret: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    }),
  });
  if (error) throw error;
}

export async function getStravaTokens(userId: string): Promise<StravaTokens | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_get_strava_tokens", { p_user_id: userId });
  if (error) throw error;
  if (typeof data !== "string" || !data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<StravaTokens>;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_at) return null;
    return parsed as StravaTokens;
  } catch {
    return null;
  }
}

/**
 * Access token valido per l'utente, rinnovato e salvato se in scadenza.
 * Lancia StravaAuthError se non c'è collegamento o il refresh è rifiutato.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const tokens = await getStravaTokens(userId);
  if (!tokens) throw new StravaAuthError();
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - now > REFRESH_MARGIN_S) return tokens.access_token;

  const refreshed = await requestToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  await storeStravaTokens(userId, refreshed);
  return refreshed.access_token;
}

/** Revoca best-effort dell'accesso lato Strava (scollegamento dall'app). */
export async function deauthorizeStrava(accessToken: string): Promise<void> {
  await fetch("https://www.strava.com/oauth/deauthorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: accessToken }),
  });
}

/** Nome visualizzato dell'atleta Strava. */
export function athleteDisplayName(athlete: StravaAthlete | undefined): string | null {
  if (!athlete) return null;
  const full = [athlete.firstname, athlete.lastname]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  return full || athlete.username?.trim() || null;
}
