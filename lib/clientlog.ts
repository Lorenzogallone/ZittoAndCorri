"use client";

// Logger diagnostico leggero per capire i blocchi in PWA standalone su iOS.
// Tiene un ring buffer in memoria (per l'overlay a schermo) e spedisce gli
// eventi a /api/clientlog (visibili nei log delle Functions su Vercel).
// Spedisce solo in PWA standalone o quando il flag debug è attivo, per non
// rumoreggiare i log in uso normale da browser desktop.

export interface LogEntry {
  t: number;
  ev: string;
  data?: unknown;
}

// Snapshot immutabile: riassegnato (nuovo riferimento) a ogni log così
// useSyncExternalStore rileva il cambiamento; tra un log e l'altro il
// riferimento resta stabile (niente re-render infiniti).
const EMPTY: LogEntry[] = [];
let snapshot: LogEntry[] = EMPTY;
const listeners = new Set<() => void>();
const MAX = 120;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Il debug overlay/beacon è attivo se ?debug=1 è stato visitato (persistito). */
export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("clientlog") === "1";
  } catch {
    return false;
  }
}

function shouldSend(): boolean {
  return isStandalone() || isDebugEnabled();
}

export function clientLog(ev: string, data?: unknown): void {
  if (typeof window === "undefined") return;
  const entry: LogEntry = { t: Date.now(), ev, data };
  const next = snapshot.concat(entry);
  snapshot = next.length > MAX ? next.slice(next.length - MAX) : next;
  listeners.forEach((l) => l());

  if (!shouldSend()) return;
  try {
    const payload = JSON.stringify({
      ev,
      data: data ?? null,
      url: location.pathname + location.search,
      standalone: isStandalone(),
      ts: new Date().toISOString(),
    });
    // sendBeacon è fire-and-forget e sopravvive a unload/navigazioni; se non
    // disponibile, fetch keepalive. Mai bloccante per l'app.
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/clientlog", blob)) return;
    fetch("/api/clientlog", {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // logging non deve mai rompere l'app
  }
}

export function getLogs(): LogEntry[] {
  return snapshot;
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
