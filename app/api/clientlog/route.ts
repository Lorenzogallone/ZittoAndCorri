// Diagnostic endpoint: receives the client logger's events and prints them in the
// server logs (visible in Vercel Functions). No persistence: it only serves
// to see what happens in standalone PWA on iOS, where there are no devtools.
// Only for users with a valid session; body and rate limited, fields truncated.

import { createClient } from "@/lib/supabase/server";
import {
  CLIENTLOG_MAX_BODY_BYTES,
  createRateLimiter,
  sanitizeClientLog,
} from "@/lib/clientlog/sanitize";

export const dynamic = "force-dynamic";

const allow = createRateLimiter();

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CLIENTLOG_MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return new Response(null, { status: 401 });
  if (!allow(userId)) return new Response(null, { status: 429 });

  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > CLIENTLOG_MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }
    const line = sanitizeClientLog(body, userId);
    if (!line) return new Response(null, { status: 400 });
    // Filterable prefix in Vercel logs: search "[clientlog]".
    console.log("[clientlog]", line);
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
