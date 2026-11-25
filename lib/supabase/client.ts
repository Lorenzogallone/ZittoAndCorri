import { createBrowserClient } from "@supabase/ssr";

/**
    * Supabase client for Client Components (browser).
    * Uses only the public keys (URL + anon key).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Configurazione Supabase pubblica mancante.");
  }
  return createBrowserClient(
    url,
    publishableKey,
  );
}
