"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export interface ProfileFormState {
  error?: string;
  ok?: boolean;
}

function optInt(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const display_name = String(formData.get("display_name") ?? "").trim() || null;
  const max_hr = optInt(formData, "max_hr");
  const resting_hr = optInt(formData, "resting_hr");
  const birthdateRaw = String(formData.get("birthdate") ?? "").trim();
  const birthdate = birthdateRaw || null;

  if (max_hr != null && resting_hr != null && max_hr <= resting_hr) {
    return { error: "HR max deve essere maggiore della HR a riposo." };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name, max_hr, resting_hr, birthdate },
      { onConflict: "id" },
    );

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function regenerateApiKey(): Promise<{ error?: string; ok?: boolean; key?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const newKey = crypto.randomUUID();

  const { error } = await supabase
    .from("profiles")
    .update({ api_key: newKey })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true, key: newKey };
}
