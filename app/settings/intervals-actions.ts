"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAthlete, IntervalsError } from "@/lib/intervals/client";
import {
  getIntervalsConnection,
  intervalsNotMigrated,
  removeIntervalsApiKey,
  storeIntervalsApiKey,
  updateIntervalsOptions,
  type IntervalsOptions,
} from "@/lib/intervals/credentials";
import { runIntervalsSync, type IntervalsSyncResult } from "@/lib/intervals/sync";

const MIGRATION_ERROR = "Per usare Intervals.icu serve aggiornare il database (migrazione 0025).";

async function authenticatedUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function saveIntervalsKey(apiKey: string): Promise<{ error?: string; ok?: boolean; athlete?: { id: string; name: string | null } }> {
  const userId = await authenticatedUserId();
  const key = apiKey.trim();
  if (key.length < 8) return { error: "La chiave Intervals.icu non sembra valida." };
  let athlete: { id: string; name: string | null };
  try {
    const fetched = await fetchAthlete(key);
    athlete = { id: fetched.id, name: fetched.name ?? null };
  } catch (error) {
    console.error("saveIntervalsKey verify:", error instanceof Error ? error.message : error);
    return {
      error: error instanceof IntervalsError && (error.status === 401 || error.status === 403)
        ? "Chiave Intervals.icu non valida."
        : "Non riesco a verificare la chiave con Intervals.icu. Riprova.",
    };
  }
  try {
    await storeIntervalsApiKey(userId, key, athlete);
  } catch (error) {
    console.error("saveIntervalsKey:", error instanceof Error ? error.message : error);
    return { error: intervalsNotMigrated(error as { code?: string }) ? MIGRATION_ERROR : "Impossibile salvare la chiave. Riprova." };
  }
  revalidatePath("/settings");
  return { ok: true, athlete };
}

export async function deleteIntervalsKey(): Promise<{ error?: string; ok?: boolean }> {
  const userId = await authenticatedUserId();
  try {
    await removeIntervalsApiKey(userId);
  } catch (error) {
    console.error("deleteIntervalsKey:", error instanceof Error ? error.message : error);
    return { error: "Impossibile rimuovere la chiave. Riprova." };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveIntervalsOptions(options: IntervalsOptions): Promise<{ error?: string; ok?: boolean }> {
  const userId = await authenticatedUserId();
  const clean: IntervalsOptions = {};
  if (typeof options.import_activities === "boolean") clean.import_activities = options.import_activities;
  if (typeof options.import_wellness === "boolean") clean.import_wellness = options.import_wellness;
  if (typeof options.publish_plan === "boolean") clean.publish_plan = options.publish_plan;
  if (options.target_preference && ["auto", "pace", "hr"].includes(options.target_preference)) {
    clean.target_preference = options.target_preference;
  }
  try {
    await updateIntervalsOptions(userId, clean);
  } catch (error) {
    console.error("saveIntervalsOptions:", error instanceof Error ? error.message : error);
    return { error: "Impossibile salvare le preferenze. Riprova." };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function syncIntervalsNow(): Promise<{ error?: string; result?: IntervalsSyncResult }> {
  const userId = await authenticatedUserId();
  const supabase = await createClient();
  const connection = await getIntervalsConnection(supabase, userId);
  if (connection === undefined) return { error: MIGRATION_ERROR };
  if (!connection) return { error: "Salva prima la chiave Intervals.icu." };
  try {
    const result = await runIntervalsSync(userId, connection);
    revalidatePath("/settings");
    revalidatePath("/activities");
    revalidatePath("/profile");
    revalidatePath("/");
    return { result };
  } catch (error) {
    console.error("syncIntervalsNow:", error instanceof Error ? error.message : error);
    return { error: "Sincronizzazione non riuscita. Riprova." };
  }
}
