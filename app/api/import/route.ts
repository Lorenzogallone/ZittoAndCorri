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
    if (!ingestToken || !ingestUserId) {
      return Response.json(
        { error: "Bearer auth non configurata sul server." },
        { status: 500 },
      );
    }
    if (token !== ingestToken) {
      return Response.json({ error: "Token non valido." }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    supabase = createServiceClient(url, serviceKey);
    userId = ingestUserId;
  } else {
    // Autenticazione sessione cookie
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
