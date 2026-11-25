"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { BatteryLow } from "lucide-react";
import { undoAdaptation } from "@/app/plan/actions";

/** Avviso di piano adattato con il ripristino a un tocco. */
export function AdaptationBanner({ until, paused }: { until: string; paused: boolean }) {
  const t = useTranslations("plan.banner");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = new Date(`${until}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3">
      <BatteryLow size={18} className="shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">
        {t(paused ? "paused" : "lightened", { date: label })}
        {error && <span className="block text-xs text-destructive">{error}</span>}
      </p>
      <button
        type="button"
        disabled={pending}
        className="text-sm font-medium text-primary disabled:opacity-50"
        onClick={() => startTransition(async () => {
          const result = await undoAdaptation();
          if (result.error) setError(result.error);
          else router.refresh();
        })}
      >
        {pending ? "…" : t("restore")}
      </button>
    </div>
  );
}
