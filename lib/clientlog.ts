"use client";

// Lightweight diagnostic logger to understand hangs in standalone PWA on iOS.
// Keeps an in-memory ring buffer (for the on-screen overlay) and sends
// events to /api/clientlog (visible in the Functions logs on Vercel).
// Sends only in standalone PWA or when the debug flag is on, to avoid
// cluttering logs in normal desktop browser use.

export interface LogEntry {
  t: number;
  ev: string;
  data?: unknown;
}

// Immutable snapshot: reassigned (new reference) on every log so
// useSyncExternalStore detects the change; between one log and the next the
// reference stays stable (no infinite re-renders).
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

/** The debug overlay/beacon is on if ?debug=1 was visited (persisted). */
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
    // sendBeacon is fire-and-forget and survives unload/navigation; if not
    // available, fetch keepalive. Never blocking for the app.
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/clientlog", blob)) return;
    fetch("/api/clientlog", {
      method: "POST",
      body: payload,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // logging must never break the app
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
