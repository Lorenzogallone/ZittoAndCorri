"use client";

import { clientLog, isStandalone } from "@/lib/clientlog";

/**
 * Naviga dopo una mutazione (salvataggio/modifica corsa) verso `href`, con
 * semantica "replace" (la pagina sorgente non resta nella history).
 *
 * In PWA standalone iOS la soft-navigation RSC (router.replace / redirect lato
 * server) può restare appesa lasciando la pagina in loading: usiamo un full
 * document load (window.location.replace), affidabile. Da browser usiamo la
 * navigazione soft del router (più fluida, niente reload).
 */
export function navigateAfterMutation(
  router: { replace: (href: string) => void },
  href: string,
): void {
  clientLog("nav:after-mutation", { href, standalone: isStandalone() });
  if (isStandalone()) {
    window.location.replace(href);
  } else {
    router.replace(href);
  }
}
