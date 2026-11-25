"use client";

import { clientLog, isStandalone } from "@/lib/clientlog";

/**
 * Navigates after a mutation (saving/editing a run) to `href`, with
 * "replace" semantics (the source page doesn't stay in history).
 *
 * In iOS standalone PWA the RSC soft navigation (router.replace / server-side
 * redirect) can hang leaving the page loading: we use a full
 * document load (window.location.replace), which is reliable. In a browser we use the
 * router's soft navigation (smoother, no reload).
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
