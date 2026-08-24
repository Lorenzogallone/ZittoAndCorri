import "server-only";

import { createClient } from "@supabase/supabase-js";

/** Client amministrativo solo server. La secret key non deve mai raggiungere React. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Configurazione mancante: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY sono obbligatorie.",
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
