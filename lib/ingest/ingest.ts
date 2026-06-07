// Pipeline di ingest. PLAN.md §6:
// 1. valida con Zod; 2. calcola campi derivati; 3. insert in activities; 4. (Fase 4) snapshot+AI.

import type { SupabaseClient } from "@supabase/supabase-js";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage } from "@/lib/metrics/zones";
import type { Activity, Profile } from "@/lib/types";
import { ActivityInput } from "./schema";

interface IngestContext {
  supabase: SupabaseClient;
  userId: string;
  /** Config atleta per il calcolo zone-da-media (max_hr/resting_hr). */
  profile: Pick<Profile, "max_hr" | "resting_hr">;
}

/**
 * Normalizza un input qualsiasi in una riga `activities`, calcolando i campi
 * derivati con le funzioni pure di `lib/metrics`, e lo persiste.
 * Ritorna l'id della corsa creata.
 */
export async function ingestActivity(
  input: unknown,
  ctx: IngestContext,
): Promise<string> {
  // 1. validazione
  const data = ActivityInput.parse(input);

  // 2. campi derivati (deterministici, mai dall'LLM)
  const avg_pace_s_km = avgPace(data.distance_m, data.duration_s);
  const time_in_zone = timeInZoneFromAverage(
    data.avg_hr,
    data.duration_s,
    ctx.profile,
  );

  // 3. insert (RLS + user_id esplicito). Stream/split: Fase 2.
  const { data: row, error } = await ctx.supabase
    .from("activities")
    .insert({
      user_id: ctx.userId,
      source: data.source,
      type: data.type,
      started_at: data.started_at,
      distance_m: data.distance_m,
      duration_s: data.duration_s,
      moving_time_s: data.moving_time_s ?? null,
      avg_pace_s_km,
      avg_hr: data.avg_hr ?? null,
      max_hr: data.max_hr ?? null,
      elevation_gain_m: data.elevation_gain_m ?? null,
      rpe: data.rpe ?? null,
      time_in_zone,
      notes: data.notes ?? null,
      raw_payload: data,
    })
    .select("id")
    .single<Pick<Activity, "id">>();

  if (error) throw error;

  // 4. Fase 4: await recomputeSnapshot(ctx.userId) + valutazione AI
  return row.id;
}
