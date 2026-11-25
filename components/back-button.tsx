"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  /** Fallback href if history is empty or unavailable */
  fallbackHref?: string;
  /** Label shown next to the arrow */
  label?: string;
}

/**
 * If a destination is given, the label describes a specific navigation
 * and must always lead there. `router.back()` is kept only for generic buttons
 * without a destination, so PWA history cannot contradict the UI.
 */
export function BackButton({ fallbackHref, label }: BackButtonProps) {
  const t = useTranslations("shell");
  const router = useRouter();
  const text = label ?? t("backButton.label");

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const className = "pressable -ml-2 inline-flex items-center text-body font-medium text-primary";

  if (fallbackHref) {
    return (
      <Link href={fallbackHref} className={className} data-press="dim">
        <ChevronLeft size={22} strokeWidth={2.2} /> {text}
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
      <ChevronLeft size={22} strokeWidth={2.2} /> {text}
    </button>
  );
}
