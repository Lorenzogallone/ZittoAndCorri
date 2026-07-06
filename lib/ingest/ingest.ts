// Pipeline di ingest. PLAN.md §6:
// 1. valida con Zod; 2. calcola campi derivati; 3. insert in activities; 4. (Fase 4) snapshot+AI.

import type { SupabaseClient } from "@supabase/supabase-js";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage, timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import { avgCadenceSpm, computeHrDrift } from "@/lib/metrics/effort";
import type { Activity, Profile } from "@/lib/types";
import { ActivityInput } from "./schema";

interface IngestContext {
  supabase: SupabaseClient;
  userId: string;
  /** Config atleta per il calcolo zone (max_hr/resting_hr). */
  profile: Pick<Profile, "max_hr" | "resting_hr">;
}

/**
 * Normalizza un input qualsiasi in una riga `activities`, calcola i campi
 * derivati con le funzioni pure di `lib/metrics`, e lo persiste insieme agli
 * eventuali stream in `activity_streams`.
 * Ritorna l'id della corsa creata.
 */
export async function ingestActivity(
  input: unknown,
  ctx: IngestContext,
): Promise<string> {
  // 1. validazione
  const data = ActivityInput.parse(input);

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
