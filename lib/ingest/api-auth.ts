// Autenticazione condivisa degli endpoint /api/import*. PLAN.md §6.
// Due modalità: sessione cookie (browser/PWA) oppure Authorization: Bearer
// <api_key del profilo> (Comandi Rapidi iOS, script). Prima era duplicata in
// ogni route handler; qui vive una volta sola.

import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import type { ingestActivity } from "@/lib/ingest/ingest";

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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabase = createServiceClient(url, serviceKey);

    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .eq("api_key", token)
      .maybeSingle();

    if (dbError || !profile) {
      // Fallback sul token statico in .env.local per retrocompatibilità.
      const ingestToken = process.env.INGEST_TOKEN;
      const ingestUserId = process.env.INGEST_USER_ID;
      if (ingestToken && token === ingestToken && ingestUserId) {
        userId = ingestUserId;
      } else {
        return null;
      }
    } else {
      userId = profile.id;
    }
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

  return {
    supabase,
    userId,
    profile: profile ?? { max_hr: null, resting_hr: 50 },
  };
}
