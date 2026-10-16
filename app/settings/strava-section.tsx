"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Check, RefreshCw, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IntegrationCard } from "./integration-card";
import { disconnectStrava, syncStravaNow } from "./strava-actions";

/** Colonne non segrete di strava_connections lette dalla pagina. */
export interface StravaConnectionView {
  athlete_name: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

interface Props {
  connection: StravaConnectionView | null;
  focusRequested?: boolean;
}

// Esiti del callback OAuth (?strava=...).
const CALLBACK_ERRORS: Record<string, string> = {
  denied: "Autorizzazione annullata.",
  scope: "Serve il permesso di lettura delle attività.",
  error: "Collegamento non riuscito. Riprova.",
};

function StravaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "mai";
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

function importedLabel(n: number): string {
  if (n === 0) return "Nessuna nuova attività";
  return n === 1 ? "1 nuova attività" : `${n} nuove attività`;
}

export function StravaSection({ connection, focusRequested = false }: Props) {
  const status = useSearchParams().get("strava");
  const [action, setAction] = useState<"sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const syncing = pending && action === "sync";

  const sync = () => {
    setAction("sync");
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await syncStravaNow();
        if (result.error) setError(result.error);
        if (!result.error || result.imported > 0) setMessage(importedLabel(result.imported));
      } catch {
        setError("Import non riuscito. Riprova.");
      }
    });
  };

  const disconnect = () => {
    if (!window.confirm("Scollegare Strava? Le attività già importate restano.")) return;
    setAction("disconnect");
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await disconnectStrava();
        if (result.error) setError(result.error);
      } catch {
        setError("Impossibile scollegare Strava. Riprova.");
      }
    });
  };

  const shownError = error ?? (connection ? connection.last_error : status ? CALLBACK_ERRORS[status] : null);

  return (
    <IntegrationCard
      id="strava-integration"
      icon={<StravaIcon />}
      title="Strava"
      description="Importa automaticamente le attività salvate su Strava."
      defaultOpen={focusRequested}
    >
      <div className="space-y-3">
        {connection ? (
          <>
            <div className="rounded-xl bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Check size={16} className="shrink-0 text-emerald-500" />
                <span className="min-w-0 truncate">
                  Collegato come <span className="font-medium">{connection.athlete_name ?? "atleta Strava"}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                Ultima sincronizzazione: {formatDate(connection.last_sync_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={sync}>
                <RefreshCw className={syncing ? "animate-spin" : undefined} />
                {syncing ? "Importo…" : "Importa ora"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={disconnect}>
                <Unlink /> Scollega
              </Button>
              {message && <span role="status" className="text-xs text-muted-foreground">{message}</span>}
            </div>
          </>
        ) : (
          <a
            href="/api/strava/connect"
            className={cn(buttonVariants(), "w-full bg-[#FC4C02] text-white shadow-[#FC4C02]/20")}
          >
            <StravaIcon size={16} /> Collega Strava
          </a>
        )}

        {shownError && <p role="alert" className="text-xs text-destructive">{shownError}</p>}
      </div>
    </IntegrationCard>
  );
}
