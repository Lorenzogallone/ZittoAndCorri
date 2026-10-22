import "server-only";

// Client minimo per l'API pubblica di Intervals.icu (chiave personale, basic
// auth con utente "API_KEY"). Documentazione: https://intervals.icu/api/v1/docs

const BASE_URL = "https://intervals.icu/api/v1";
const TIMEOUT_MS = 20_000;

export class IntervalsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "IntervalsError";
  }
}

export interface IntervalsClient {
  apiKey: string;
  athleteId: string;
}

export interface IntervalsAthlete {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type: string | null;
  name: string | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  distance?: number | null;
  source?: string | null;
  external_id?: string | null;
}

export interface IntervalsWellness {
  id: string; // data ISO
  sleepSecs?: number | null;
  sleepScore?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  spO2?: number | null;
  steps?: number | null;
  stress?: number | null;
  readiness?: number | null;
  vo2max?: number | null;
  weight?: number | null;
  updated?: string | null;
}

export interface IntervalsEventInput {
  category: "WORKOUT";
  type: "Run";
  start_date_local: string;
  name: string;
  description: string;
  external_id: string;
  moving_time?: number;
  distance?: number;
}

export interface IntervalsEvent {
  id: number;
  category: string;
  name?: string | null;
  description?: string | null;
  start_date_local: string;
  external_id?: string | null;
  push_errors?: unknown;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

async function call(client: IntervalsClient, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(client.apiKey),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? "";
    } catch {
      // corpo non JSON: basta lo status
    }
    throw new IntervalsError(detail || `Intervals.icu HTTP ${response.status}`, response.status);
  }
  return response;
}

async function json<T>(client: IntervalsClient, path: string, init: RequestInit = {}): Promise<T> {
  const response = await call(client, path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Verifica la chiave e ritorna l'atleta proprietario ("0" = chi possiede la chiave). */
export async function fetchAthlete(apiKey: string, athleteId = "0"): Promise<IntervalsAthlete> {
  const athlete = await json<IntervalsAthlete>({ apiKey, athleteId }, `/athlete/${encodeURIComponent(athleteId)}`);
  if (!athlete || !athlete.id) throw new IntervalsError("Risposta inattesa da Intervals.icu.", 502);
  return { id: String(athlete.id), name: athlete.name ?? null, email: athlete.email ?? null };
}

export async function listActivities(client: IntervalsClient, oldest: string, newest: string): Promise<IntervalsActivity[]> {
  const query = new URLSearchParams({ oldest, newest });
  const rows = await json<IntervalsActivity[]>(client, `/athlete/${client.athleteId}/activities?${query}`);
  return Array.isArray(rows) ? rows : [];
}

/** FIT generato da Intervals.icu: sempre un FIT valido, anche quando l'originale Zepp è uno zip. */
export async function downloadFitFile(client: IntervalsClient, activityId: string): Promise<ArrayBuffer> {
  const response = await call(client, `/activity/${encodeURIComponent(activityId)}/fit-file`, {
    headers: { Accept: "*/*" },
  });
  return response.arrayBuffer();
}

export async function listWellness(client: IntervalsClient, oldest: string, newest: string): Promise<IntervalsWellness[]> {
  const query = new URLSearchParams({ oldest, newest });
  const rows = await json<IntervalsWellness[]>(client, `/athlete/${client.athleteId}/wellness?${query}`);
  return Array.isArray(rows) ? rows : [];
}

export async function listEvents(client: IntervalsClient, oldest: string, newest: string): Promise<IntervalsEvent[]> {
  const query = new URLSearchParams({ oldest, newest, category: "WORKOUT" });
  const rows = await json<IntervalsEvent[]>(client, `/athlete/${client.athleteId}/events?${query}`);
  return Array.isArray(rows) ? rows : [];
}

export async function createEvents(client: IntervalsClient, events: IntervalsEventInput[]): Promise<IntervalsEvent[]> {
  if (!events.length) return [];
  const rows = await json<IntervalsEvent[]>(client, `/athlete/${client.athleteId}/events/bulk`, {
    method: "POST",
    body: JSON.stringify(events),
  });
  return Array.isArray(rows) ? rows : [];
}

export async function updateEvent(client: IntervalsClient, eventId: number, event: IntervalsEventInput): Promise<IntervalsEvent> {
  return json<IntervalsEvent>(client, `/athlete/${client.athleteId}/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(event),
  });
}

export async function deleteEvents(client: IntervalsClient, eventIds: number[]): Promise<void> {
  if (!eventIds.length) return;
  await call(client, `/athlete/${client.athleteId}/events/bulk-delete`, {
    method: "PUT",
    body: JSON.stringify(eventIds.map((id) => ({ id }))),
  });
}
