"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clientLog, isStandalone } from "@/lib/clientlog";

/**
 * Thin coral progress bar at the top of the screen that animates
 * whenever a Next.js navigation starts. Gives visual feedback that
 * the page is loading (important on Vercel where RSC rendering takes time).
 *
 * It reacts to every kind of navigation:
 *  - link clicks (earliest possible feedback)
 *  - back / forward (popstate, e.g. the iOS back gesture or back button)
 *  - programmatic navigation (router.push / router.replace, server-action
 *    redirects) by patching history.pushState / replaceState
 *
 * WATCHDOG (fix PWA iOS): su iOS standalone le fetch RSC di una navigazione
 * possono restare appese all'infinito → la pagina resta sullo skeleton di
 * loading anche se la mutazione lato server è già andata a buon fine. Se la
 * navigazione non si completa entro NAV_WATCHDOG_MS, forziamo una navigazione
 * "vera" (full document load) verso la destinazione: un caricamento completo è
 * affidabile dove la fetch RSC si impalla.
 */
const NAV_WATCHDOG_MS = 6000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);
  // URL di destinazione della navigazione in corso (per il watchdog).
  const pendingTargetRef = useRef<string | null>(null);

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
  }

  // Simulate progress: quickly get to ~85%, then stall and wait for route change
  function startProgress(target?: string | null) {
    if (target) pendingTargetRef.current = target;
    if (runningRef.current) return; // already animating — don't restart
    runningRef.current = true;
    clearTimers();
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    setVisible(true);
    setProgress(10);

    clientLog("nav:start", { from: window.location.pathname, target: pendingTargetRef.current });

    let current = 10;
    function tick() {
      // Slow down as we approach 85%
      const increment = current < 40 ? 12 : current < 65 ? 6 : current < 80 ? 2 : 0.5;
      current = Math.min(current + increment, 85);
      setProgress(current);
      if (current < 85) {
        timerRef.current = setTimeout(() => {
          rafRef.current = requestAnimationFrame(tick);
        }, 100);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    // Safety net: if the route never resolves (e.g. same-page navigation
    // or an aborted transition) auto-complete so the bar never gets stuck.
    safetyRef.current = setTimeout(() => completeProgress(), 10000);

    // Watchdog: se la navigazione resta appesa (bug RSC su iOS standalone),
    // forza un full document load verso la destinazione. Solo in standalone:
    // da browser le navigazioni RSC si completano sempre e non vogliamo reload
    // a sorpresa.
    watchdogRef.current = setTimeout(() => {
      if (!runningRef.current) return;
      const target = pendingTargetRef.current ?? window.location.href;
      clientLog("nav:stuck", { target, standalone: isStandalone() });
      if (isStandalone()) {
        clientLog("nav:hard-redirect", { target });
        window.location.assign(target);
      }
    }, NAV_WATCHDOG_MS);
  }

  function completeProgress() {
    clearTimers();
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
    pendingTargetRef.current = null;
    runningRef.current = false;
    setProgress(100);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }

  // Complete whenever the route actually changes
  useEffect(() => {
    const currentRoute = `${pathname}?${searchParams}`;
    if (currentRoute !== prevRouteRef.current) {
      prevRouteRef.current = currentRoute;
      clientLog("nav:complete", { route: pathname });
      completeProgress();
    }
  }, [pathname, searchParams]);

  // Intercept link clicks to start the progress bar as early as possible
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Only internal same-origin links
      if (href.startsWith("/") || href.startsWith(window.location.origin)) {
        const absolute = new URL(href, window.location.origin);
        const targetPath = absolute.pathname;
        if (targetPath !== pathname) {
          startProgress(absolute.href);
        }
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname]);

  // Start on back/forward (popstate) and programmatic navigation
  // (pushState/replaceState). Covers router.push/replace, server-action
  // redirects and the OS/browser back button — none of which fire a link click.
  useEffect(() => {
    function handlePopState() {
      startProgress(window.location.href);
    }
    window.addEventListener("popstate", handlePopState);

    const origPush = history.pushState;
    const origReplace = history.replaceState;

    function patched(
      orig: History["pushState"],
      args: Parameters<History["pushState"]>,
    ) {
      const url = args[2];
      if (url != null) {
        const absolute = new URL(url, window.location.href);
        if (absolute.pathname !== window.location.pathname) {
          startProgress(absolute.href);
        }
      }
      return orig.apply(history, args);
    }

    history.pushState = function (
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      return patched(origPush, args);
    };
    history.replaceState = function (
      this: History,
      ...args: Parameters<History["replaceState"]>
    ) {
      return patched(origReplace, args);
    };

    return () => {
      window.removeEventListener("popstate", handlePopState);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="nav-progress-bar"
      style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    />
  );
}
