"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

export function PwaSplashLoader() {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Detect standalone mode (running as installed PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      // Avoid showing the splash screen on internal page reloads/transitions
      const hasShown = sessionStorage.getItem("pwa-splash-shown");
      if (!hasShown) {
        setShow(true);
        // Start fading out after 1200ms
        const timer1 = setTimeout(() => {
          setFade(true);
          // Completely unmount after the fade transition (300ms)
          const timer2 = setTimeout(() => {
            setShow(false);
            sessionStorage.setItem("pwa-splash-shown", "true");
          }, 300);
          return () => clearTimeout(timer2);
        }, 1200);

        return () => clearTimeout(timer1);
      }
    }
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background transition-opacity duration-300 ${
        fade ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Pulsing logo container */}
        <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 text-primary glow-coral-sm animate-pulse">
          <Flame size={44} className="text-primary" />
        </div>

        {/* Brand typography */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Zitto e Corri
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 font-medium">
            Il tuo coach di corsa personale
          </p>
        </div>

        {/* Loading track and bar */}
        <div className="w-32 h-1 bg-muted rounded-full overflow-hidden mt-2 relative">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-primary rounded-full animate-pwa-loading" />
        </div>
      </div>
    </div>
  );
}
