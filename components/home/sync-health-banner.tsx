"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CloudOff, X } from "lucide-react";
import type { SyncIssue } from "@/lib/sync-health";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zc:sync-banner-dismissed";
const CHANGE_EVENT = "zc:sync-banner-change";

/** Firma dei problemi: se cambia (nuovo problema o nuova data) il banner torna. */
const signature = (issues: SyncIssue[]) => issues.map((issue) => `${issue.kind}:${issue.since ?? ""}`).join("|");

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Avviso compatto "dati fermi": una riga con il problema più importante, il
 * link alle impostazioni dell'integrazione e la X per chiuderlo. Chiuso resta
 * nascosto finché i problemi sono gli stessi. Non compare se è tutto a posto.
 */
export function SyncHealthBanner({ issues, className }: { issues: SyncIssue[]; className?: string }) {
  // undefined sul server: si mostra solo dopo aver letto se era stato chiuso,
  // così un avviso già chiuso non lampeggia all'apertura.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => undefined);
  const [issue] = issues;
  const current = signature(issues);
  if (!issue || dismissed === undefined || dismissed === current) return null;
  const others = issues.length - 1;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // Senza storage (navigazione privata) si chiude solo fino al prossimo caricamento.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-2xl bg-muted/50 py-1.5 pl-4 pr-1", className)}>
      <CloudOff size={18} aria-hidden className="shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 py-1.5 text-sm leading-snug" title={issues.map((item) => item.text).join("\n")}>
        {issue.text}
        {others > 0 && <span className="text-muted-foreground"> · +{others}</span>}
      </p>
      <Link href={issue.href} className="shrink-0 text-sm font-medium text-primary">
        Controlla
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Chiudi l'avviso"
        className="pressable grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
