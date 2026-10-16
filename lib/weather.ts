import "server-only";

// Meteo previsto per le sedute (Open-Meteo: gratuito, senza chiave). La
// posizione è il punto di partenza delle corse recenti e l'ora quella in cui
// l'atleta corre di solito: nessun permesso di localizzazione richiesto.

import type { SupabaseClient } from "@supabase/supabase-js";
import { heatSlowdownPct } from "@/lib/metrics/heat";
import { addDays, romeDay, romeHour } from "@/lib/local-date";

export interface HeatInfo {
  date: string;
  hour: number;
  temp_c: number;
  dew_point_c: number;
  /** Rallentamento consigliato in %, 0 se non serve. */
  pct: number;
}

interface RunSpot {
  lat: number;
  lon: number;
  hour: number;
}

const FORECAST_DAYS = 15;

/** Punto di partenza e ora tipica delle corse recenti. */
async function usualRunSpot(supabase: SupabaseClient, userId: string): Promise<RunSpot | null> {
  const { data: runs } = await supabase
    .from("activities")
    .select("id, started_at")
    .eq("user_id", userId)
    .eq("sport", "running")
    .order("started_at", { ascending: false })
    .limit(8)
    .returns<Array<{ id: string; started_at: string }>>();
  if (!runs?.length) return null;

  const { data: starts } = await supabase
    .from("activity_streams")
    .select("activity_id, first:gps_series->0")
    .in("activity_id", runs.map((run) => run.id))
    .returns<Array<{ activity_id: string; first: { lat?: number; lon?: number } | null }>>();
  const byId = new Map((starts ?? []).map((row) => [row.activity_id, row.first]));
  const point = runs
    .map((run) => byId.get(run.id))
    .find((first): first is { lat: number; lon: number } =>
      typeof first?.lat === "number" && typeof first?.lon === "number");
  if (!point) return null;

  const hours = runs
    .map((run) => romeHour(run.started_at))
    .filter((hour): hour is number => hour != null)
    .sort((a, b) => a - b);
  const hour = hours.length ? hours[Math.floor(hours.length / 2)] : 18;
  // Due decimali (~1 km): basta per il meteo e non espone il percorso esatto.
  return { lat: Math.round(point.lat * 100) / 100, lon: Math.round(point.lon * 100) / 100, hour };
}

interface ForecastResponse {
  hourly?: { time?: string[]; temperature_2m?: Array<number | null>; dew_point_2m?: Array<number | null> };
}

/**
 * Caldo previsto per le date richieste (solo entro l'orizzonte di previsione).
 * Mai bloccante: in caso di errore torna una mappa vuota.
 */
export async function heatForDates(
  supabase: SupabaseClient,
  userId: string,
  dates: string[],
): Promise<Map<string, HeatInfo>> {
  const out = new Map<string, HeatInfo>();
  const today = romeDay();
  const horizon = addDays(today, FORECAST_DAYS - 1);
  const wanted = [...new Set(dates)].filter((date) => date >= today && date <= horizon).sort();
  if (!wanted.length) return out;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("heat_adjust")
      .eq("id", userId)
      .maybeSingle<{ heat_adjust: boolean | null }>();
    if (profile?.heat_adjust === false) return out;

    const spot = await usualRunSpot(supabase, userId);
    if (!spot) return out;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(spot.lat));
    url.searchParams.set("longitude", String(spot.lon));
    url.searchParams.set("hourly", "temperature_2m,dew_point_2m");
    url.searchParams.set("timezone", "Europe/Rome");
    url.searchParams.set("start_date", wanted[0]);
    url.searchParams.set("end_date", wanted[wanted.length - 1]);
    const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return out;
    const forecast = (await response.json()) as ForecastResponse;
    const times = forecast.hourly?.time ?? [];
    for (const date of wanted) {
      const index = times.indexOf(`${date}T${String(spot.hour).padStart(2, "0")}:00`);
      const temp = forecast.hourly?.temperature_2m?.[index];
      const dew = forecast.hourly?.dew_point_2m?.[index];
      if (index < 0 || temp == null || dew == null) continue;
      out.set(date, {
        date,
        hour: spot.hour,
        temp_c: Math.round(temp),
        dew_point_c: Math.round(dew),
        pct: heatSlowdownPct(temp, dew),
      });
    }
  } catch (error) {
    console.error("heatForDates:", error instanceof Error ? error.message : error);
  }
  return out;
}
