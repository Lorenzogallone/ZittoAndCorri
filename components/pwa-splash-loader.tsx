"use client";

import { useEffect } from "react";

/** Dissolve e rimuove lo splash PWA renderizzato inline dal layout (vedi
 *  `#pwa-splash` in app/layout.tsx). Lo splash appare con l'HTML iniziale —
 *  prima di qualunque JS — e questo componente lo chiude appena l'app è
 *  idratata, segnando la sessione per non rimostrarlo a ogni navigazione. */
export function PwaSplashLoader() {
  useEffect(() => {
    const el = document.getElementById("pwa-splash");
    if (!el) return;

    // Segna subito la sessione: se iOS rilancia il documento mentre la dissolvenza
    // è ancora in corso, lo script inline non deve mostrare una seconda splash.
    try {
      sessionStorage.setItem("pwa-splash-shown", "true");
    } catch {
      // sessionStorage non disponibile: la splash resta comunque temporizzata.
    }

    // Tiene lo splash visibile un attimo dopo l'hydration per evitare un
    // flash, poi dissolve (la transition è definita nel CSS inline).
    let removeTimer: ReturnType<typeof setTimeout> | null = null;
    const fadeTimer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      removeTimer = setTimeout(() => {
        el.remove();
      }, 300);
    }, 350);

    return () => {
      clearTimeout(fadeTimer);
      if (removeTimer) clearTimeout(removeTimer);
    };
  }, []);

  return null;
}
