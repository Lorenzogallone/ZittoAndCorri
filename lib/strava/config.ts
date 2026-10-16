import "server-only";

// Credenziali dell'app API Strava (strava.com/settings/api). Il verify token
// serve solo alla validazione della sottoscrizione webhook.

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  verifyToken: string | null;
}

export function getStravaConfig(): StravaConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    verifyToken: process.env.STRAVA_VERIFY_TOKEN?.trim() || null,
  };
}

/** True se l'integrazione è attiva su questo deploy (mostra la sezione in Impostazioni). */
export function isStravaConfigured(): boolean {
  return getStravaConfig() !== null;
}

/** Finestra degli import iniziali e manuali. */
export const STRAVA_SYNC_DAYS = 14;

/** Cookie httpOnly con lo state OAuth (anti-CSRF) tra connect e callback. */
export const STRAVA_STATE_COOKIE = "strava_oauth_state";
