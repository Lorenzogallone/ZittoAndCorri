import "server-only";

// Import di attività Strava condiviso da callback OAuth, webhook e sync
// manuale: scarica dettaglio + stream, mappa, passa da ingestActivity (dedupe
// e arricchimento inclusi) e accoda la valutazione AI.

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestActivity } from "@/lib/ingest/ingest";
import { enqueueActivityEvaluationSafely } from "@/lib/ai/evaluate-activity";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import type { Profile } from "@/lib/types";
import { STRAVA_SYNC_DAYS } from "./config";
import { mapStravaActivity } from "./map";
import {
  getActivity,
  getActivityStreams,
  getAthlete,
  listActivities,
  StravaAuthError,
  StravaError,
  StravaRateLimitError,
} from "./api";
import {
  athleteDisplayName,
  deauthorizeStrava,
  getValidAccessToken,
  storeStravaTokens,
  type StravaTokenResponse,
} from "./tokens";

type IngestContext = Parameters<typeof ingestActivity>[1];

export interface StravaSyncResult {
  imported: number;
  error?: string;
}

/** Contesto di ingest con client admin e config HR effettiva dell'utente. */
async function ingestContextFor(userId: string): Promise<IngestContext> {
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(supabase, userId, profile ?? null);
  return { supabase, userId, profile: effectiveHr };
}

/** Messaggio breve per l'utente (salvato in last_error). */
function userMessage(error: unknown): string {
  if (error instanceof StravaError) return error.message;
  return "Alcune attività non sono state importate.";
}

/** Utente collegato a un atleta Strava (owner_id del webhook). */
export async function findUserByAthlete(athleteId: number): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("strava_connections")
    .select("user_id")
    .eq("athlete_id", athleteId)
    .maybeSingle<{ user_id: string }>();
  return data?.user_id ?? null;
}

export async function recordStravaSync(
  userId: string,
  result: { error?: string | null; synced?: boolean },
): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = { last_error: result.error ?? null };
  if (result.synced) update.last_sync_at = new Date().toISOString();
  const { error } = await admin.from("strava_connections").update(update).eq("user_id", userId);
  if (error) console.error("recordStravaSync:", error.message);
}

/**
 * Salva il collegamento dopo il callback OAuth. Se lo stesso atleta era
 * collegato a un altro utente, quel collegamento viene rimosso.
 */
export async function saveStravaConnection(
  userId: string,
  token: StravaTokenResponse,
  scope: string | null,
): Promise<void> {
  if (!token.athlete?.id) throw new StravaError("Atleta Strava mancante nella risposta OAuth.");
  const admin = createAdminClient();

  const { data: others } = await admin
    .from("strava_connections")
    .select("user_id")
    .eq("athlete_id", token.athlete.id)
    .neq("user_id", userId)
    .returns<Array<{ user_id: string }>>();
  for (const other of others ?? []) {
    const { error } = await admin.rpc("admin_delete_strava_connection", { p_user_id: other.user_id });
    if (error) throw error;
  }

  const { error } = await admin.from("strava_connections").upsert(
    {
      user_id: userId,
      athlete_id: token.athlete.id,
      athlete_name: athleteDisplayName(token.athlete),
      scope,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  try {
    await storeStravaTokens(userId, token);
  } catch (storeError) {
    // Senza token il collegamento non serve: niente riga "collegata" a metà.
    await deleteStravaConnection(userId).catch(() => undefined);
    throw storeError;
  }
}

/**
 * Importa una singola attività Strava. Ritorna l'id dell'attività creata o
 * arricchita, oppure null se era già importata o non esiste più.
 */
export async function importStravaActivity(
  userId: string,
  stravaId: number | string,
  opts: { token?: string; ctx?: IngestContext } = {},
): Promise<string | null> {
  const admin = opts.ctx?.supabase ?? createAdminClient();
  const { data: existing } = await admin
    .from("activities")
    .select("id")
    .eq("user_id", userId)
    .eq("external_id", String(stravaId))
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing) return null;

  const token = opts.token ?? (await getValidAccessToken(userId));
  const detail = await getActivity(token, stravaId);
  if (!detail) return null;
  const streams = await getActivityStreams(token, stravaId);
  const input = mapStravaActivity(detail, streams);

  const ctx = opts.ctx ?? (await ingestContextFor(userId));
  let id: string;
  try {
    id = await ingestActivity(input, ctx);
  } catch (error) {
    // Import concorrente (webhook + sync) già arrivato: nessun duplicato.
    if ((error as { code?: string })?.code === "23505") return null;
    throw error;
  }
  await enqueueActivityEvaluationSafely(userId, id);
  return id;
}

/** Import da webhook: una attività, con esito registrato sul collegamento. */
export async function importStravaActivityForWebhook(
  userId: string,
  stravaId: number,
): Promise<void> {
  try {
    await importStravaActivity(userId, stravaId);
    await recordStravaSync(userId, { synced: true });
  } catch (error) {
    console.error("Strava webhook import:", stravaId, error);
    await recordStravaSync(userId, { error: userMessage(error) });
  }
}

/** Importa le attività degli ultimi `days` giorni non ancora presenti. */
export async function importRecentStravaActivities(
  userId: string,
  days = STRAVA_SYNC_DAYS,
): Promise<StravaSyncResult> {
  let imported = 0;
  let firstError: string | undefined;
  try {
    const token = await getValidAccessToken(userId);
    const after = Math.floor(Date.now() / 1000) - days * 86_400;
    const summaries = await listActivities(token, after);

    const ctx = await ingestContextFor(userId);
    const ids = summaries.map((s) => String(s.id));
    const { data: known } = ids.length
      ? await ctx.supabase
          .from("activities")
          .select("external_id")
          .eq("user_id", userId)
          .in("external_id", ids)
          .returns<Array<{ external_id: string }>>()
      : { data: [] };
    const knownIds = new Set((known ?? []).map((r) => r.external_id));

    for (const summary of summaries) {
      if (knownIds.has(String(summary.id))) continue;
      try {
        const id = await importStravaActivity(userId, summary.id, { token, ctx });
        if (id) imported++;
      } catch (error) {
        // Limite di richieste o accesso revocato: inutile proseguire.
        if (error instanceof StravaRateLimitError || error instanceof StravaAuthError) throw error;
        console.error("Strava import:", summary.id, error);
        firstError ??= userMessage(error);
      }
    }
    await recordStravaSync(userId, { synced: true, error: firstError });
  } catch (error) {
    console.error("Strava sync:", error);
    firstError = userMessage(error);
    await recordStravaSync(userId, { error: firstError });
  }
  return firstError ? { imported, error: firstError } : { imported };
}

/**
 * Deauth da webhook: gli eventi non sono firmati, quindi prima di cancellare
 * si verifica che il token sia davvero revocato.
 */
export async function handleStravaDeauthorization(userId: string): Promise<void> {
  try {
    const token = await getValidAccessToken(userId);
    await getAthlete(token);
    console.warn("Strava deauth ignorata: token ancora valido per", userId);
    return;
  } catch (error) {
    if (!(error instanceof StravaAuthError)) {
      console.error("Strava deauth check:", error);
      return;
    }
  }
  await deleteStravaConnection(userId);
}

export async function deleteStravaConnection(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_strava_connection", { p_user_id: userId });
  if (error) throw error;
}

/** Scollega: revoca best-effort lato Strava, poi elimina token e collegamento. */
export async function disconnectStravaForUser(userId: string): Promise<void> {
  try {
    const token = await getValidAccessToken(userId);
    await deauthorizeStrava(token);
  } catch (error) {
    console.warn("Strava deauthorize:", error instanceof Error ? error.message : error);
  }
  await deleteStravaConnection(userId);
}
