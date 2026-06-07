"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseDuration } from "@/lib/format";
import type { Profile } from "@/lib/types";

export interface ActivityFormState {
  error?: string;
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

  const distanceKm = Number(formData.get("distance_km"));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
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

  revalidatePath("/activities");
  redirect(`/activities/${activityId}`);
}

export async function deleteActivity(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // RLS + filtro esplicito su user_id: l'utente cancella solo le proprie corse.
  await supabase.from("activities").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/activities");
  redirect("/activities");
}
