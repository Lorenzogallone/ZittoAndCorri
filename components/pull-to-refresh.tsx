"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { tap } from "@/lib/haptics";
import { refreshMessage, useAppRefresh } from "@/lib/use-app-refresh";

/** Distanza (dopo la resistenza) oltre la quale, al rilascio, si ricarica. */
const THRESHOLD = 72;
/** Altezza a cui il contenuto resta mentre gira lo spinner. */
const HOLD = 56;
/** Tetto della resistenza: il contenuto non scende mai oltre. */
const MAX_PULL = 140;
/** Quanto resta visibile l'esito («Aggiornato») dopo la ricarica. */
const RESULT_MS = 1_400;

/** Resistenza elastica: all'inizio segue il dito, poi rallenta verso MAX_PULL. */
function resist(dy: number): number {
  return MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)));
}

/** Il tocco parte da un campo o da una zona che gestisce già i suoi gesti. */
function ignoresPull(target: Element): boolean {
  return !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-no-pull]");
}

/** Un contenitore interno (es. la lista della chat) non è in cima: scorre lui. */
function innerScrollerAway(target: Element, root: HTMLElement): boolean {
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollTop > 0) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

/**
 * Il contenitore che scorre di AppShell, con il trascina-giù per ricaricare.
 *
 * `overscroll-behavior: none` resta globale (PWA standalone su iOS), quindi il
 * gesto è fatto a mano: si attiva solo partendo dalla cima, con un tocco
 * verticale verso il basso; tutto il resto (scroll, swipe orizzontali, campi,
 * chat a tutto schermo e sheet, che stanno in un portale) resta al browser.
 */
export function PullToRefresh({ className, children }: { className?: string; children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const { refreshing, result, refresh } = useAppRefresh();
  const refreshingRef = useRef(refreshing);
  const [showResult, setShowResult] = useState(false);
  const [held, setHeld] = useState(false);

  // Sposta contenuto e indicatore senza passare da React a ogni touchmove.
  const paint = useCallback((distance: number, animate: boolean) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) return;
    const transition = animate ? "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out" : "none";
    content.style.transition = transition;
    indicator.style.transition = transition;
    content.style.transform = distance ? `translate3d(0, ${distance}px, 0)` : "";
    const progress = Math.min(distance / THRESHOLD, 1);
    indicator.style.transform = `translate3d(0, ${distance - 44}px, 0) scale(${0.6 + progress * 0.4})`;
    indicator.style.opacity = String(distance ? Math.max(progress, 0.15) : 0);
    if (iconRef.current && !refreshingRef.current) iconRef.current.style.transform = `rotate(${progress * 270}deg)`;
  }, []);

  useEffect(() => {
    refreshingRef.current = refreshing;
    if (refreshing) return;
    // Ricarica finita: mostra l'esito un attimo, poi tutto torna su.
    if (!held) return;
    const show = window.setTimeout(() => setShowResult(true), 0);
    const hide = window.setTimeout(() => {
      paint(0, true);
      setHeld(false);
      setShowResult(false);
    }, RESULT_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [refreshing, held, paint]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    let distance = 0;
    let armed = false;

    const onStart = (event: TouchEvent) => {
      tracking = false;
      if (event.touches.length !== 1 || refreshingRef.current) return;
      const target = event.target as Element | null;
      if (!target || main.scrollTop > 0 || ignoresPull(target) || innerScrollerAway(target, main)) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
      pulling = false;
      distance = 0;
      armed = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!pulling) {
        if (dx === 0 && dy === 0) return;
        // Verso l'alto, in orizzontale o con la pagina già scesa: è scroll.
        if (dy <= 0 || Math.abs(dx) > dy || main.scrollTop > 0) {
          tracking = false;
          return;
        }
        pulling = true;
      }
      // Da qui il gesto è nostro: niente scroll o rimbalzo nativo sotto.
      if (event.cancelable) event.preventDefault();
      distance = resist(Math.max(dy, 0));
      paint(distance, false);
      if (!armed && distance >= THRESHOLD) {
        armed = true;
        tap();
      } else if (armed && distance < THRESHOLD) armed = false;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!pulling) return;
      pulling = false;
      if (distance >= THRESHOLD) {
        setHeld(true);
        paint(HOLD, true);
        refresh();
      } else paint(0, true);
      distance = 0;
    };

    main.addEventListener("touchstart", onStart, { passive: true });
    // Non passivo: deve poter fermare lo scroll nativo, ma solo durante il gesto.
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd, { passive: true });
    main.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh, paint]);

  const message = showResult ? refreshMessage(result) : null;
  const failed = !!result?.error;

  return (
    <main ref={mainRef} className={className}>
      {/* Alternativa al gesto per tastiera e VoiceOver; su desktop c'è «Aggiorna» nella barra laterale. */}
      <div className="sticky top-0 z-40 flex h-0 justify-center lg:hidden">
        <button
          type="button"
          onClick={refresh}
          className="sr-only rounded-full bg-card text-caption font-medium text-foreground shadow-[var(--surface-shadow)] outline-none focus-visible:not-sr-only focus-visible:mt-2 focus-visible:h-9 focus-visible:shrink-0 focus-visible:px-4 focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          Aggiorna la pagina
        </button>
      </div>
      {/* Alta zero e attaccata in cima: l'indicatore non sposta il layout. */}
      <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-center" aria-live="polite">
        <div
          ref={indicatorRef}
          className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-card px-2.5 text-caption font-medium text-muted-foreground opacity-0 shadow-[var(--surface-shadow)] ring-1 ring-border/60"
          style={{ transform: "translate3d(0, -44px, 0)" }}
        >
          {message ? (
            failed ? <TriangleAlert size={16} className="text-destructive" /> : <Check size={16} className="text-primary" />
          ) : (
            <RefreshCw ref={iconRef} size={16} className={cn("text-primary", refreshing && "animate-spin")} />
          )}
          {message && <span className="pr-0.5">{message}</span>}
          {refreshing && <span className="sr-only">Aggiorno…</span>}
        </div>
      </div>
      <div ref={contentRef} className="h-full">
        {children}
      </div>
    </main>
  );
}
