import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback OAuth: Supabase reindirizza qui con `?code=...` dopo il consenso Google.
 * Scambiamo il code con la sessione (PKCE) e mandiamo l'utente alla destinazione.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code mancante o scambio fallito → torna al login con flag d'errore.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
