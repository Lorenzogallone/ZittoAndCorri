"use client";

import { useEffect } from "react";
import { RunnerMark } from "@/components/runner-mark";

/**
 * L'app vive solo in verticale. Il manifest chiede `orientation: portrait`,
 * ma iOS lo ignora e non espone l'API di blocco: in orizzontale copriamo
 * quindi l'app con un invito a girare il telefono (solo su schermi touch
 * bassi, mai su desktop). Dove il blocco esiste (Android installata) lo
 * chiediamo davvero.
 */
export function PortraitLock() {
  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    if (typeof orientation?.lock !== "function") return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (!standalone) return;
    orientation.lock("portrait").catch(() => {
      // iOS e i browser non in fullscreen rifiutano: resta l'overlay CSS.
    });
  }, []);

  return (
    <div className="portrait-lock" role="status" aria-live="polite">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-hero text-primary">
        <RunnerMark size={56} cutout="var(--hero)" node="var(--hero-foreground)" />
      </span>
      <p className="font-display text-title font-bold tracking-tight">Gira il telefono</p>
      <p className="max-w-xs text-center text-body text-muted-foreground">
        Zitto e Corri funziona solo in verticale.
      </p>
    </div>
  );
}
