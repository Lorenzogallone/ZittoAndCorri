"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin coral progress bar at the top of the screen that animates
 * whenever a Next.js navigation starts. Gives visual feedback that
 * the page is loading (important on Vercel where RSC rendering takes time).
 *
 * It reacts to every kind of navigation:
 *  - link clicks (earliest possible feedback)
 *  - back / forward (popstate, e.g. the iOS back gesture or back button)
 *  - programmatic navigation (router.push / router.replace, server-action
 *    redirects) by patching history.pushState
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
  }

  // Simulate progress: quickly get to ~85%, then stall and wait for route change
  function startProgress() {
    if (runningRef.current) return; // already animating — don't restart
    runningRef.current = true;
    clearTimers();
    if (safetyRef.current) clearTimeout(safetyRef.current);
    setVisible(true);
    setProgress(10);

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
  }

  function completeProgress() {
    clearTimers();
    if (safetyRef.current) clearTimeout(safetyRef.current);
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
        const targetPath = href.replace(window.location.origin, "").split("?")[0];
        if (targetPath !== pathname) {
          startProgress();
        }
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname]);

  // Start on back/forward (popstate) and programmatic navigation (pushState).
  // Covers router.push/replace, server-action redirects and the OS/browser
  // back button — none of which fire a link click.
  useEffect(() => {
    function handlePopState() {
      startProgress();
    }
    window.addEventListener("popstate", handlePopState);

    const origPush = history.pushState;
    history.pushState = function (
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      const url = args[2];
      if (url != null) {
        const newPath = new URL(url, window.location.href).pathname;
        if (newPath !== window.location.pathname) {
          startProgress();
        }
      }
      return origPush.apply(this, args);
    };

    return () => {
      window.removeEventListener("popstate", handlePopState);
      history.pushState = origPush;
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
