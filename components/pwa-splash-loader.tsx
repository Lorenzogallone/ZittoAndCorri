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

    // Tiene lo splash visibile un attimo dopo l'hydration per evitare un
    // flash, poi dissolve (la transition è definita nel CSS inline).
    const fadeTimer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      const removeTimer = setTimeout(() => {
        el.remove();
        try {
          sessionStorage.setItem("pwa-splash-shown", "true");
        } catch {
          // sessionStorage non disponibile: lo splash si rimostrerà, pazienza
        }
      }, 300);
      return () => clearTimeout(removeTimer);
    }, 350);

    return () => clearTimeout(fadeTimer);
  }, []);

  return null;
}
