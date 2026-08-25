// Autenticazione condivisa degli endpoint /api/import*. PLAN.md §6.
// Due modalità: sessione cookie (browser/PWA) oppure Authorization: Bearer
// <api_key del profilo> (Comandi Rapidi iOS, script). Prima era duplicata in
// ogni route handler; qui vive una volta sola.

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
 * Risolve l'utente della richiesta e costruisce il contesto di ingest
 * (client Supabase + profilo per il calcolo zone).
 * Ritorna null se non autenticato: la route risponde 401.
 */
export async function resolveImportAuth(
  req: NextRequest,
): Promise<IngestContext | null> {
  let userId: string;
  let supabase: SupabaseClient;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    // Autenticazione Bearer: cerca il profilo con questa api_key
    // (service role per bypassare RLS).
    supabase = createAdminClient();

    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .eq("api_key", token)
      .maybeSingle();

    if (dbError || !profile) return null;
    userId = profile.id;
  } else {
    // Autenticazione sessione cookie (browser).
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  // Profilo atleta per il calcolo zone.
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
