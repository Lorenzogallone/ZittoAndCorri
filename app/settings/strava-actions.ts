"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStravaConfigured } from "@/lib/strava/config";
import {
  disconnectStravaForUser,
  importRecentStravaActivities,
  type StravaSyncResult,
} from "@/lib/strava/import";

async function authenticatedUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

/** Importa le attività Strava degli ultimi 14 giorni non ancora presenti. */
export async function syncStravaNow(): Promise<StravaSyncResult> {
  const userId = await authenticatedUserId();
  if (!isStravaConfigured()) return { imported: 0, error: "Strava non è configurato." };
  const result = await importRecentStravaActivities(userId);
  revalidatePath("/settings");
  if (result.imported > 0) {
    revalidatePath("/");
    revalidatePath("/activities");
  }
  return result;
}

export async function disconnectStrava(): Promise<{ ok?: boolean; error?: string }> {
  const userId = await authenticatedUserId();
  try {
    await disconnectStravaForUser(userId);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    console.error("disconnectStrava:", error instanceof Error ? error.message : error);
    return { error: "Impossibile scollegare Strava. Riprova." };
  }
}
