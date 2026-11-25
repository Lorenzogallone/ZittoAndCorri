"use client";

import { useEffect, useRef, useState } from "react";
import { UpdateToast } from "@/components/update-toast";

/** Update check on return to the foreground: at most every 30 min. */
const UPDATE_CHECK_KEY = "zc-sw-update-check";
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function shouldCheckForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(UPDATE_CHECK_KEY) ?? 0);
    if (Date.now() - last < UPDATE_CHECK_INTERVAL_MS) return false;
    sessionStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/** Registers the service worker and offers the update when a new one arrives. */
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  // Reloads only after an explicit "Aggiorna": even the first clients.claim()
  // emits controllerchange and must not reload the page.
  const updateRequested = useRef(false);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !(
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      )
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let cancelled = false;

    // A worker installed while the page already has a controller is an
    // update (on first install there is no controller: no toast).
    const offerIfWaiting = (worker: ServiceWorker | null) => {
      if (!cancelled && worker && worker.state === "installed" && navigator.serviceWorker.controller) {
        setWaiting(worker);
      }
    };
    const track = (worker: ServiceWorker | null) => {
      worker?.addEventListener("statechange", () => offerIfWaiting(worker));
    };
    const onUpdateFound = () => track(registration?.installing ?? null);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        offerIfWaiting(reg.waiting);
        track(reg.installing);
        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch((err) => {
        console.error("Service Worker registration failed:", err);
      });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !registration) return;
      if (!shouldCheckForUpdate()) return;
      registration.update().catch(() => {});
    };

    let reloaded = false;
    const onControllerChange = () => {
      if (!updateRequested.current || reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const update = () => {
    if (!waiting) return;
    updateRequested.current = true;
    setUpdating(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <UpdateToast
      visible={waiting !== null}
      updating={updating}
      onUpdate={update}
      onDismiss={() => setWaiting(null)}
    />
  );
}
