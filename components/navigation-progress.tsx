"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin coral progress bar at the top of the screen that animates
 * whenever a Next.js navigation starts. Gives visual feedback that
 * the page is loading (important on Vercel where RSC rendering takes time).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);

  // Simulate progress: quickly get to ~80%, then stall and wait for route change
  function startProgress() {
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
  }

  function completeProgress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(100);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }

  useEffect(() => {
    const currentRoute = `${pathname}?${searchParams}`;
    if (currentRoute !== prevRouteRef.current) {
      prevRouteRef.current = currentRoute;
      completeProgress();
    }
  }, [pathname, searchParams]);

  // Intercept all link clicks to start the progress bar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Only internal same-origin links
      if (href.startsWith("/") || href.startsWith(window.location.origin)) {
        const targetPath = href.replace(window.location.origin, "").split("?")[0];
        const currentPath = pathname;
        if (targetPath !== currentPath) {
          if (timerRef.current) clearTimeout(timerRef.current);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          startProgress();
        }
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="nav-progress-bar"
      style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    />
  );
}
