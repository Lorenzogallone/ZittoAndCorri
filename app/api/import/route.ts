// Route Handler: POST /api/import. PLAN.md §6.
// Auth: sessione cookie (browser) oppure Authorization: Bearer INGEST_TOKEN (Shortcut/script).
// Con Bearer token usa INGEST_USER_ID come user_id (nessuna migrazione DB richiesta).

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ingestActivity } from "@/lib/ingest/ingest";
import type { Profile } from "@/lib/types";

export async function POST(req: NextRequest) {
  let userId: string;
  let supabase: SupabaseClient;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const ingestToken = process.env.INGEST_TOKEN;
  const ingestUserId = process.env.INGEST_USER_ID;

  if (token) {
    // Autenticazione Bearer
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabase = createServiceClient(url, serviceKey);

    // Cerca il profilo con questa api_key (usando service role per bypassare RLS)
    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .eq("api_key", token)
      .maybeSingle();

    if (dbError || !profile) {
      // Fallback sul token statico in .env.local per retrocompatibilità
      if (ingestToken && token === ingestToken && ingestUserId) {
        userId = ingestUserId;
      } else {
        return Response.json({ error: "Token non valido." }, { status: 401 });
      }
    } else {
      userId = profile.id;
    }
  } else {
    // Autenticazione sessione cookie (browser)
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Non autenticato." }, { status: 401 });
    }
    userId = user.id;
  }

  // Profilo atleta per il calcolo zone
  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", userId)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  const ctx = {
    supabase,
    userId,
    profile: profile ?? { max_hr: null, resting_hr: 50 },
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const inputs = Array.isArray(body) ? body : [body];

  try {
    const ids: string[] = [];
    for (const inp of inputs) {
      ids.push(await ingestActivity(inp, ctx));
    }
    return Response.json(ids.length === 1 ? { id: ids[0] } : { ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore durante l'import.";
    return Response.json({ error: msg }, { status: 422 });
  }
}
