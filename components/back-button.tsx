"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface BackButtonProps {
  /** Fallback href if history is empty or unavailable */
  fallbackHref?: string;
  /** Label shown next to the arrow */
  label?: string;
}

/**
 * Se è indicata una destinazione, l'etichetta descrive una navigazione precisa
 * e deve sempre portare lì. `router.back()` resta solo per i pulsanti generici
 * senza destinazione, così la cronologia PWA non può contraddire la UI.
 */
export function BackButton({ fallbackHref, label = "Indietro" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const className = "text-muted-foreground text-sm hover:text-foreground transition-colors active:scale-95";

  if (fallbackHref) {
    return (
      <Link href={fallbackHref} className={className}>
        ← {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={className}
    >
      ← {label}
    </button>
  );
}
