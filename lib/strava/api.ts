import "server-only";

// Client minimale dell'API Strava v3 (solo fetch). Gli errori sono tipizzati
// per distinguere limite di richieste (429) e autorizzazione revocata (401).

import type { StravaActivity, StravaStreams } from "./map";

const API_BASE = "https://www.strava.com/api/v3";
const PER_PAGE = 50;
const MAX_PAGES = 4;

export class StravaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "StravaError";
  }
}

/** 429: limite di 15 minuti o giornaliero superato. */
export class StravaRateLimitError extends StravaError {
  constructor() {
    super("Limite di richieste Strava raggiunto. Riprova più tardi.", 429);
    this.name = "StravaRateLimitError";
  }
}

/** Token mancante, scaduto senza refresh possibile o accesso revocato. */
export class StravaAuthError extends StravaError {
  constructor(status?: number) {
    super("Autorizzazione Strava scaduta o revocata. Ricollega l'account.", status);
    this.name = "StravaAuthError";
  }
}

/** Riassunto da GET /athlete/activities. */
export interface StravaActivitySummary {
  id: number;
  start_date: string;
}

async function stravaGet<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) throw new StravaRateLimitError();
  if (res.status === 401) throw new StravaAuthError(401);
  if (res.status === 404) return null;
  if (!res.ok) throw new StravaError(`Strava ha risposto ${res.status}.`, res.status);
  return (await res.json()) as T;
}

export async function getActivity(token: string, id: number | string): Promise<StravaActivity | null> {
  return stravaGet<StravaActivity>(token, `/activities/${id}?include_all_efforts=false`);
}

/** Stream della attività; null per le attività manuali senza tracce. */
export async function getActivityStreams(token: string, id: number | string): Promise<StravaStreams | null> {
  return stravaGet<StravaStreams>(
    token,
    `/activities/${id}/streams?keys=time,latlng,altitude,heartrate,cadence&key_by_type=true`,
  );
}

/** Attività iniziate dopo `afterEpoch` (secondi), dalla più vecchia. */
export async function listActivities(token: string, afterEpoch: number): Promise<StravaActivitySummary[]> {
  const out: StravaActivitySummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await stravaGet<StravaActivitySummary[]>(
      token,
      `/athlete/activities?after=${Math.floor(afterEpoch)}&per_page=${PER_PAGE}&page=${page}`,
    );
    if (!batch?.length) break;
    out.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Verifica che il token sia ancora valido (lancia StravaAuthError se revocato). */
export async function getAthlete(token: string): Promise<{ id: number } | null> {
  return stravaGet<{ id: number }>(token, "/athlete");
}
