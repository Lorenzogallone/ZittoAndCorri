"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // In caso di successo il browser viene reindirizzato a Google.
  }

  return (
    <main className="flex flex-1 min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">ZittoAndCorri</h1>
        <p className="text-muted-foreground text-sm">
          Accedi per tracciare le tue corse.
        </p>
      </div>
      <Button onClick={signInWithGoogle} disabled={loading} size="lg">
        {loading ? "Reindirizzo…" : "Accedi con Google"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </main>
  );
}
