"use client";

import { useCallback, useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAppData, type RefreshResult } from "@/app/actions/refresh";

/** Evento sul window a ricarica fatta: chi fa polling (analisi AI) riparte subito. */
export const APP_REFRESH_EVENT = "zc:app-refresh";

// Stato condiviso tra trascina-giù e pulsante «Aggiorna»: una ricarica alla volta.
type Snapshot = { busy: boolean; result: RefreshResult | null };
let snapshot: Snapshot = { busy: false, result: null };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}
const serverSnapshot: Snapshot = { busy: false, result: null };

/** Spinner visibile almeno così: una ricarica istantanea non deve sembrare un glitch. */
const MIN_SPIN_MS = 600;

/**
 * Ricarica la pagina corrente: import dall'orologio, poi nuovo fetch dei dati
 * (refresh() nella server action, dentro una transizione: `refreshing` resta
 * true finché la pagina aggiornata non è a schermo).
 */
export function useAppRefresh() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
  const [transitionPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    if (snapshot.busy) return;
    set({ busy: true, result: null });
    const started = Date.now();
    startTransition(async () => {
      let result: RefreshResult;
      try {
        result = await refreshAppData();
      } catch {
        result = { imported: 0, error: "Connessione assente. Riprova." };
      }
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      window.dispatchEvent(new Event(APP_REFRESH_EVENT));
      set({ busy: false, result });
    });
  }, []);

  return { refreshing: state.busy || transitionPending, result: state.result, refresh };
}

/** Riga breve sull'esito: null quando non c'è niente da dire. */
export function refreshMessage(result: RefreshResult | null): string | null {
  if (!result) return null;
  if (result.error) return result.error;
  if (result.stillSyncing) return "L'orologio sta ancora sincronizzando";
  if (result.imported === 1) return "1 attività nuova";
  if (result.imported > 1) return `${result.imported} attività nuove`;
  return "Aggiornato";
}

/**
 * Mentre `active` è vero (es. un'analisi AI avviata dal server), rifà il fetch
 * della pagina ogni `everyMs`, al massimo `times` volte: il risultato compare
 * da solo, senza trascinare giù.
 */
export function useRefreshWhile(active: boolean, everyMs = 8_000, times = 30) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let count = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      count += 1;
      if (count > times) window.clearInterval(timer);
      else router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs, times, router]);
}
