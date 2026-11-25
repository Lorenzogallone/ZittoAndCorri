// Shared authentication for the /api/import* endpoints. PLAN.md §6.
// Two modes: cookie session (browser/PWA) or Authorization: Bearer
// <profile api_key> (iOS Shortcuts, scripts). It used to be duplicated in
// every route handler; now it lives in one place.

import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import type { ingestActivity } from "@/lib/ingest/ingest";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";

type IngestContext = Parameters<typeof ingestActivity>[1];

/**
 * Resolves the request's user and builds the ingest context
 * (Supabase client + profile for zone calculation).
 * Returns null if not authenticated: the route responds 401.
 */
export async function resolveImportAuth(
  req: NextRequest,
): Promise<IngestContext | null> {
  let userId: string;
  let supabase: SupabaseClient;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    // Bearer authentication: look up the profile with this api_key
    // (service role to bypass RLS).
    supabase = createAdminClient();

    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .eq("api_key", token)
      .maybeSingle();

    if (dbError || !profile) return null;
    userId = profile.id;
  } else {
    // Cookie session authentication (browser).
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  // Athlete profile for zone calculation.
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", userId)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();
  const effectiveHr = await getEffectiveHrConfig(supabase, userId, profile ?? null);

  return {
    supabase,
    userId,
    profile: effectiveHr,
  };
}
