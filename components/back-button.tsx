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

  const className = "-ml-2 inline-flex items-center text-body font-medium text-primary transition-opacity active:opacity-50";

  if (fallbackHref) {
    return (
      <Link href={fallbackHref} className={className}>
        <ChevronLeft size={22} strokeWidth={2.2} /> {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={className}
    >
      <ChevronLeft size={22} strokeWidth={2.2} /> {label}
    </button>
  );
}
