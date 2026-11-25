"use client";

import { useCallback, useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Translator } from "@/i18n/config";
import { refreshAppData, type RefreshResult } from "@/app/actions/refresh";

/** Event on window when a reload finishes: whoever polls (AI analysis) restarts right away. */
export const APP_REFRESH_EVENT = "zc:app-refresh";

// State shared between pull-down and the «Refresh» button: one reload at a time.
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

/** Spinner visible at least this long: an instant reload must not look like a glitch. */
const MIN_SPIN_MS = 600;

/**
    * Reloads the current page: import from the watch, then a new data fetch
    * (refresh() in the server action, inside a transition: `refreshing` stays
    * true until the updated page is on screen).
 */
export function useAppRefresh() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
  const [transitionPending, startTransition] = useTransition();
  const t = useTranslations("status");

  const refresh = useCallback(() => {
    if (snapshot.busy) return;
    set({ busy: true, result: null });
    const started = Date.now();
    startTransition(async () => {
      let result: RefreshResult;
      try {
        result = await refreshAppData();
      } catch {
        result = { imported: 0, error: t("refresh.offline") };
      }
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      window.dispatchEvent(new Event(APP_REFRESH_EVENT));
      set({ busy: false, result });
    });
  }, [t]);

  return { refreshing: state.busy || transitionPending, result: state.result, refresh };
}

/** Short line about the outcome: null when there is nothing to say. `t` is bound to the "status" namespace. */
export function refreshMessage(result: RefreshResult | null, t: Translator): string | null {
  if (!result) return null;
  if (result.error) return result.error;
  if (result.stillSyncing) return t("refresh.stillSyncing");
  if (result.imported >= 1) return t("refresh.newActivities", { count: result.imported });
  return t("refresh.updated");
}

/**
    * While `active` is true (e.g. an AI analysis started by the server), refetches
    * the page every `everyMs`, at most `times` times: the result appears
    * on its own, without pulling down.
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
