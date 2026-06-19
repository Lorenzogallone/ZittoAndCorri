"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import { parseDuration } from "@/lib/format";
import type { Activity, Profile } from "@/lib/types";
import { avgPace } from "@/lib/metrics/pace";
import { timeInZoneFromAverage, timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";

export interface ActivityFormState {
  error?: string;
  /** Id della corsa creata: il client naviga al dettaglio (vedi navigateAfterMutation). */
  id?: string;
}

/** Legge un campo numero opzionale dal form; "" → undefined. */
function optInt(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export async function createActivity(
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // --- parsing input del form ---
  const startedAtLocal = String(formData.get("started_at") ?? "").trim();
  if (!startedAtLocal) return { error: "Inserisci data e ora." };
  const startedAt = new Date(startedAtLocal);
  if (Number.isNaN(startedAt.getTime())) return { error: "Data/ora non valida." };

  const sport = String(formData.get("sport") ?? "running");
  const isRunning = sport === "running";

  // Distanza: obbligatoria per la corsa; opzionale per gli altri sport
  // (palestra, calcio, yoga… spesso non ne hanno una sensata).
  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  const distanceKm = distanceRaw === "" ? 0 : Number(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || (isRunning && distanceKm <= 0)) {
    return { error: "Distanza non valida." };
  }
  const duration_s = parseDuration(String(formData.get("duration") ?? ""));
  if (duration_s == null || duration_s <= 0) {
    return { error: "Durata non valida (usa h:mm:ss o mm:ss)." };
  }

  const type = String(formData.get("type") ?? "easy");
  const notes = String(formData.get("notes") ?? "").trim();

  // --- profilo (per zone-da-media) ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  // --- ingest unificato ---
  let activityId: string;
  try {
    activityId = await ingestActivity(
      {
        source: "manual",
        type,
        sport,
        started_at: startedAt.toISOString(),
        distance_m: Math.round(distanceKm * 1000),
        duration_s,
        avg_hr: optInt(formData, "avg_hr"),
        max_hr: optInt(formData, "max_hr"),
        elevation_gain_m: optInt(formData, "elevation_gain_m"),
        rpe: optInt(formData, "rpe"),
        notes: notes || undefined,
      },
      {
        supabase,
        userId: user.id,
        profile: profile ?? { max_hr: null, resting_hr: 50 },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante il salvataggio.";
    return { error: msg };
  }

  // Collega il planned_workout se selezionato
  const plannedId = formData.get("planned_workout_id");
  if (typeof plannedId === "string" && plannedId.trim()) {
    await supabase
      .from("planned_workouts")
      .update({ activity_id: activityId, status: "completed" })
      .eq("id", plannedId)
      .eq("user_id", user.id);
    revalidatePath("/plan");
  }

  revalidatePath("/activities");
  // Niente redirect lato server: torniamo l'id e il client naviga (soft da
  // browser, full load in PWA standalone, dove la soft-navigation si impalla).
  return { id: activityId };
}

export interface GpxImportFormState {
  error?: string;
}

export async function importGpxActivity(
  _prevState: GpxImportFormState,
  formData: FormData,
): Promise<GpxImportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("gpx_file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Nessun file selezionato." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "gpx") {
    return { error: "Solo file .gpx esportati da Strava sono supportati." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  const ctx = {
    supabase,
    userId: user.id,
    profile: profile ?? { max_hr: null, resting_hr: 50 },
  };

  let activityId: string;
  try {
    const text = await file.text();
    const input = parseGpx(text);
    activityId = await ingestActivity(input, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore durante l'import." };
  }

  revalidatePath("/activities");
  redirect(`/activities/${activityId}`, RedirectType.replace);
}

export async function deleteActivity(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Reset del planned_workout collegato prima di cancellare la corsa, così non
  // resta un link rotto con status "completed" e activity_id inesistente.
  await supabase
    .from("planned_workouts")
    .update({ activity_id: null, status: "planned" })
    .eq("activity_id", id)
    .eq("user_id", user.id);

  // RLS + filtro esplicito su user_id: l'utente cancella solo le proprie corse.
  await supabase.from("activities").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/plan");
  revalidatePath("/activities");
  // La navigazione la fa il client (navigateAfterMutation): niente redirect lato
  // server, che in PWA standalone lascia la pagina appesa in loading.
}

export interface EditActivityFormState {
  error?: string;
  /** Id della corsa aggiornata: il client naviga al dettaglio. */
  id?: string;
}

export async function updateActivity(
  _prevState: EditActivityFormState,
  formData: FormData,
): Promise<EditActivityFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "ID corsa mancante." };

  // Fetch existing activity to verify owner
  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Activity>();

  if (!activity) {
    return { error: "Corsa non trovata o non autorizzato." };
  }

  const startedAtLocal = String(formData.get("started_at") ?? "").trim();
  if (!startedAtLocal) return { error: "Inserisci data e ora." };
  const startedAt = new Date(startedAtLocal);
  if (Number.isNaN(startedAt.getTime())) return { error: "Data/ora non valida." };

  // Sport: se non arriva dal form (form vecchi) resta quello esistente.
  const sportRaw = String(formData.get("sport") ?? "").trim();
  const sport = sportRaw || activity.sport || "running";
  const isRunning = sport === "running";

  const distanceRaw = String(formData.get("distance_km") ?? "").trim();
  const distanceKm = distanceRaw === "" ? 0 : Number(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || (isRunning && distanceKm <= 0)) {
    return { error: "Distanza non valida." };
  }
  const duration_s = parseDuration(String(formData.get("duration") ?? ""));
  if (duration_s == null || duration_s <= 0) {
    return { error: "Durata non valida (usa h:mm:ss o mm:ss)." };
  }

  // Vincolo DB: le attività non running hanno sempre type 'cross'.
  const type = isRunning ? String(formData.get("type") ?? "easy") : "cross";
  const notes = String(formData.get("notes") ?? "").trim();
  const rpe = optInt(formData, "rpe");
  const avg_hr = optInt(formData, "avg_hr");
  const max_hr = optInt(formData, "max_hr");
  const elevation_gain_m = optInt(formData, "elevation_gain_m");

  const distance_m = Math.round(distanceKm * 1000);
  // Passo sul tempo in movimento se la corsa ne ha uno (import FIT/GPX con
  // pause): coerente con il calcolo in ingest e con Strava. La durata totale
  // resta modificabile; moving_time_s non si edita qui, lo preserviamo.
  const paceTime = activity.moving_time_s ?? duration_s;
  const avg_pace_s_km = distance_m > 0 ? avgPace(distance_m, paceTime) : null;

  // Fetch profile to calculate zone
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  const profileCtx = profile ?? { max_hr: null, resting_hr: 50 };

  // Load streams if they exist
  const { data: streams } = await supabase
    .from("activity_streams")
    .select("hr_series, gps_series")
    .eq("activity_id", id)
    .maybeSingle();

  // Recalculate HR Zones and splits if they exist
  let time_in_zone = activity.time_in_zone;
  if (streams?.hr_series && streams.hr_series.length >= 2) {
    time_in_zone = timeInZoneFromSeries(streams.hr_series, profileCtx);
  } else {
    time_in_zone = timeInZoneFromAverage(avg_hr ?? null, duration_s, profileCtx);
  }

  let splits = activity.splits;
  if (streams?.gps_series && streams.gps_series.length >= 2) {
    splits = computeSplits(streams.gps_series, streams.hr_series ?? undefined);
  }

  // Perform update
  const { error } = await supabase
    .from("activities")
    .update({
      type,
      sport,
      notes: notes || null,
      rpe: rpe ?? null,
      started_at: startedAt.toISOString(),
      distance_m,
      duration_s,
      avg_pace_s_km,
      avg_hr: avg_hr ?? null,
      max_hr: max_hr ?? null,
      elevation_gain_m: elevation_gain_m ?? null,
      time_in_zone,
      splits,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Collegamento al workout pianificato: il campo è presente solo se il form
  // lo mostra. "none" scollega; un id diverso sposta il collegamento.
  const plannedRaw = formData.get("planned_workout_id");
  if (plannedRaw !== null) {
    const desiredId = String(plannedRaw) === "none" ? null : String(plannedRaw);
    const { data: current } = await supabase
      .from("planned_workouts")
      .select("id")
      .eq("user_id", user.id)
      .eq("activity_id", id)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if ((current?.id ?? null) !== desiredId) {
      if (current) {
        await supabase
          .from("planned_workouts")
          .update({ activity_id: null, status: "planned" })
          .eq("id", current.id)
          .eq("user_id", user.id);
      }
      if (desiredId) {
        await supabase
          .from("planned_workouts")
          .update({ activity_id: id, status: "completed" })
          .eq("id", desiredId)
          .eq("user_id", user.id);
      }
      revalidatePath("/plan");
    }
  }

  revalidatePath(`/activities/${id}`);
  revalidatePath("/activities");
  return { id };
}

export async function saveParsedActivity(
  input: unknown,
  plannedWorkoutId?: string,
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  try {
    const activityId = await ingestActivity(input, {
      supabase,
      userId: user.id,
      profile: profile ?? { max_hr: null, resting_hr: 50 },
    });

    if (plannedWorkoutId) {
      await supabase
        .from("planned_workouts")
        .update({ activity_id: activityId, status: "completed" })
        .eq("id", plannedWorkoutId)
        .eq("user_id", user.id);
      revalidatePath("/plan");
    }

    revalidatePath("/activities");
    return { id: activityId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Errore durante il salvataggio." };
  }
}
