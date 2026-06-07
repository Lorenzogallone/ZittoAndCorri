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
    <main className="flex flex-1 min-h-svh flex-col items-center justify-center gap-8 p-8">
      {/* Decorative glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Zitto e Corri
        </h1>
        <p className="text-muted-foreground text-sm max-w-[240px]">
          Il tuo coach personale. Traccia, migliora, corri.
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-3 w-full max-w-xs">
        <Button
          onClick={signInWithGoogle}
          disabled={loading}
          size="lg"
          className="w-full"
        >
          {loading ? "Reindirizzo…" : "Accedi con Google"}
        </Button>
        {error && (
          <p className="text-destructive text-sm text-center">{error}</p>
        )}
      </div>
    </main>
  );
}
