"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveProfileLocale } from "@/lib/profile-locale";
import { isLocale, LOCALE_COOKIE } from "./config";

/** Saves the chosen language in the cookie (one year) and on the profile, then refreshes the app. */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // The profile copy is what cron jobs and push notifications read (no cookie there).
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await saveProfileLocale(supabase, user.id, locale);
  } catch (error) {
    console.error("setLocale profile:", error instanceof Error ? error.message : error);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
