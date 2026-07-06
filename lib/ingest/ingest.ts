// Pipeline di ingest. PLAN.md §6:
// 1. valida con Zod; 2. calcola campi derivati; 3. insert in activities; 4. (Fase 4) snapshot+AI.

import type { SupabaseClient } from "@supabase/supabase-js";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage, timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { avgCadenceSpm, computeHrDrift, type CadencePoint } from "@/lib/metrics/effort";
import type { Activity, ActivityStream, Profile } from "@/lib/types";
import { ActivityInput } from "./schema";

interface IngestContext {
  supabase: SupabaseClient;
  userId: string;
  /** Config atleta per il calcolo zone (max_hr/resting_hr). */
  profile: Pick<Profile, "max_hr" | "resting_hr">;
}

// Import da file della stessa attività (stesso sport, inizio entro questa
// finestra) arricchiscono la riga esistente invece di duplicarla: es. GPX
// condiviso da Zepp subito e FIT completo (cadenza) importato dopo.
const DEDUPE_WINDOW_MIN = 10;

/**
 * Normalizza un input qualsiasi in una riga `activities`, calcola i campi
 * derivati con le funzioni pure di `lib/metrics`, e lo persiste insieme agli
 * eventuali stream in `activity_streams`.
 *
 * Per gli import da file (source 'file'), se esiste già un'attività dello
 * stesso sport iniziata entro ±10 minuti NON crea un duplicato: riempie i
 * campi/stream mancanti della riga esistente e ricalcola le metriche derivate.
 * Ritorna l'id della corsa creata (o arricchita).
 */
export async function ingestActivity(
  input: unknown,
  ctx: IngestContext,
): Promise<string> {
  // 1. validazione
  const data = ActivityInput.parse(input);

  // 1b. dedupe/arricchimento per gli import da file
  if (data.source === "file") {
    const existing = await findNearbyActivity(data, ctx);
    if (existing) return enrichActivity(existing, data, ctx);
  }

  // Le attività non running usano sempre il tipo 'cross' (vincolo DB).
  const type = data.sport === "running" ? data.type : "cross";

  // 2. campi derivati (deterministici, mai dall'LLM)
  // Niente passo per attività senza distanza (palestra, yoga, calcio…).
  // Passo sul tempo in movimento quando disponibile (pause escluse): è il passo
  // medio che mostra Strava. Senza moving_time si usa il tempo totale.
  const paceTime = data.moving_time_s ?? data.duration_s;
  const avg_pace_s_km =
    data.distance_m > 0 ? avgPace(data.distance_m, paceTime) : null;

  // Zone HR: preferisce la serie reale; fallback alla zona-da-media
  const time_in_zone =
    data.hr_series && data.hr_series.length >= 2
      ? timeInZoneFromSeries(data.hr_series, ctx.profile)
      : timeInZoneFromAverage(data.avg_hr, data.duration_s, ctx.profile);

  // Split GPS: solo se c'è la serie
  const splits =
    data.gps_series && data.gps_series.length >= 2
      ? computeSplits(data.gps_series, data.hr_series)
      : null;

  // Metriche di sforzo dagli stream: cadenza media e deriva cardiaca
  // (decoupling passo/HR). Danno al coach AI segnali sullo stile di corsa e
  // su quanto un ritmo è davvero sostenibile.
  const avg_cadence_spm = avgCadenceSpm(data.cadence_series, data.sport);
  const hr_drift_pct = computeHrDrift(data.hr_series, data.gps_series);

  // Il payload originale serve per audit/riprocessing, ma gli stream pesanti
  // vivono già in activity_streams: duplicarli qui gonfierebbe ogni riga.
  const rawPayload = { ...data };
  delete rawPayload.hr_series;
  delete rawPayload.gps_series;
  delete rawPayload.cadence_series;

  // 3. insert activities (RLS + user_id esplicito)
  const { data: row, error } = await ctx.supabase
    .from("activities")
    .insert({
      user_id: ctx.userId,
      source: data.source,
      type,
      sport: data.sport,
      started_at: data.started_at,
      distance_m: data.distance_m,
      duration_s: data.duration_s,
      moving_time_s: data.moving_time_s ?? null,
      avg_pace_s_km,
      avg_hr: data.avg_hr ?? null,
      max_hr: data.max_hr ?? null,
      elevation_gain_m: data.elevation_gain_m ?? null,
      rpe: data.rpe ?? null,
      calories: data.calories ?? null,
      // Colonne della migration 0007: incluse solo se valorizzate, così
      // l'ingest senza stream continua a funzionare anche su DB non migrato.
      ...(avg_cadence_spm != null ? { avg_cadence_spm } : {}),
      ...(hr_drift_pct != null ? { hr_drift_pct } : {}),
      time_in_zone,
      splits,
      notes: data.notes ?? null,
      raw_payload: rawPayload,
    })
    .select("id")
    .single<Pick<Activity, "id">>();

  if (error) throw error;

  // 3b. insert activity_streams se presenti (pesanti, separati dal prompt)
  if (data.hr_series || data.gps_series || data.cadence_series) {
    const { error: streamError } = await ctx.supabase
      .from("activity_streams")
      .insert({
        activity_id: row.id,
        hr_series: data.hr_series ?? null,
        gps_series: data.gps_series ?? null,
        cadence: data.cadence_series ?? null,
      });
    if (streamError) throw streamError;
  }

  // 4. Fase 4: await recomputeSnapshot(ctx.userId) + valutazione AI
  return row.id;
}

/** Colonne lette per l'arricchimento di un'attività esistente. */
type ExistingActivity = Pick<
  Activity,
  | "id"
  | "distance_m"
  | "duration_s"
  | "moving_time_s"
  | "avg_pace_s_km"
  | "avg_hr"
  | "max_hr"
  | "elevation_gain_m"
  | "calories"
  | "notes"
>;

/**
 * Attività dello stesso utente e sport iniziata entro ±DEDUPE_WINDOW_MIN
 * dall'input: è la stessa sessione vista da un altro file.
 */
async function findNearbyActivity(
  data: ActivityInput,
  ctx: IngestContext,
): Promise<ExistingActivity | null> {
  const t = new Date(data.started_at).getTime();
  const from = new Date(t - DEDUPE_WINDOW_MIN * 60_000).toISOString();
  const to = new Date(t + DEDUPE_WINDOW_MIN * 60_000).toISOString();

  const { data: existing } = await ctx.supabase
    .from("activities")
    .select(
      "id, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr, max_hr, elevation_gain_m, calories, notes",
    )
    .eq("user_id", ctx.userId)
    .eq("sport", data.sport)
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at")
    .limit(1)
    .maybeSingle<ExistingActivity>();

  return existing ?? null;
}

/** Serie con più campioni (a parità, la prima — cioè quella già salvata). */
function longerSeries<T>(
  a: T[] | null | undefined,
  b: T[] | null | undefined,
): T[] | null {
  const aa = a && a.length > 0 ? a : null;
  const bb = b && b.length > 0 ? b : null;
  if (!aa) return bb;
  if (!bb) return aa;
  return bb.length > aa.length ? bb : aa;
}

/**
 * Arricchisce un'attività esistente con i dati di un secondo file della
 * stessa sessione: riempie i campi scalari mancanti, integra gli stream
 * (es. cadenza dal FIT quando il GPX era già stato importato) e ricalcola
 * le metriche derivate dagli stream migliori. I dati già presenti — inclusi
 * i valori rivisti a mano dall'utente — non vengono mai sovrascritti.
 */
async function enrichActivity(
  existing: ExistingActivity,
  data: ActivityInput,
  ctx: IngestContext,
): Promise<string> {
  const { data: streamRow } = await ctx.supabase
    .from("activity_streams")
    .select("hr_series, gps_series, cadence")
    .eq("activity_id", existing.id)
    .maybeSingle<Pick<ActivityStream, "hr_series" | "gps_series" | "cadence">>();

  // Stream migliori tra salvati e nuovi (per HR/GPS vince il più fitto).
  const hr = longerSeries(streamRow?.hr_series, data.hr_series);
  const gps = longerSeries(streamRow?.gps_series, data.gps_series);
  const cadence =
    (streamRow?.cadence as CadencePoint[] | null) ??
    data.cadence_series ??
    null;

  // Campi scalari: il nuovo file riempie solo i buchi.
  const moving_time_s = existing.moving_time_s ?? data.moving_time_s ?? null;
  const update: Record<string, unknown> = {
    moving_time_s,
    avg_hr: existing.avg_hr ?? data.avg_hr ?? null,
    max_hr: existing.max_hr ?? data.max_hr ?? null,
    elevation_gain_m: existing.elevation_gain_m ?? data.elevation_gain_m ?? null,
    calories: existing.calories ?? data.calories ?? null,
    notes: existing.notes ?? data.notes ?? null,
  };

  // Passo: se il moving time è arrivato solo ora, il passo va ricalcolato.
  if (existing.moving_time_s == null && moving_time_s != null && existing.distance_m > 0) {
    update.avg_pace_s_km = avgPace(existing.distance_m, moving_time_s);
  }

  // Metriche derivate dagli stream combinati.
  if (hr && hr.length >= 2) {
    update.time_in_zone = timeInZoneFromSeries(hr, ctx.profile);
  }
  if (gps && gps.length >= 2) {
    update.splits = computeSplits(gps, hr ?? undefined);
  }
  const spm = avgCadenceSpm(cadence ?? undefined, data.sport);
  if (spm != null) update.avg_cadence_spm = spm;
  const drift = computeHrDrift(hr ?? undefined, gps ?? undefined);
  if (drift != null) update.hr_drift_pct = drift;

  const { error } = await ctx.supabase
    .from("activities")
    .update(update)
    .eq("id", existing.id)
    .eq("user_id", ctx.userId);
  if (error) throw error;

  if (hr || gps || cadence) {
    const { error: streamError } = await ctx.supabase
      .from("activity_streams")
      .upsert({
        activity_id: existing.id,
        hr_series: hr,
        gps_series: gps,
        cadence,
      });
    if (streamError) throw streamError;
  }

  return existing.id;
}
