"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChevronLeft } from "lucide-react";

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

  const className = "pressable -ml-2 inline-flex items-center text-body font-medium text-primary";

  if (fallbackHref) {
    return (
      <Link href={fallbackHref} className={className} data-press="dim">
        <ChevronLeft size={22} strokeWidth={2.2} /> {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={className}
      data-press="dim"
    >
      <ChevronLeft size={22} strokeWidth={2.2} /> {label}
    </button>
  );
}
