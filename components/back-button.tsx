"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface BackButtonProps {
  /** Fallback href if history is empty or unavailable */
  fallbackHref?: string;
  /** Label shown next to the arrow */
  label?: string;
}

/**
 * Client-side back button that uses `router.back()` for true history
 * continuity. Falls back to a specified href if provided.
 *
 * Prefers `router.back()` so the user always returns to exactly the page
 * they came from, instead of a hard-coded destination.
 */
export function BackButton({ fallbackHref, label = "Indietro" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    // If there's history, go back. Otherwise use the fallback.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      router.push(fallbackHref);
    } else {
      router.push("/");
    }
  }, [router, fallbackHref]);

  return (
    <button
      type="button"
      onClick={handleBack}
      className="text-muted-foreground text-sm hover:text-foreground transition-colors active:scale-95"
    >
      ← {label}
    </button>
  );
}
