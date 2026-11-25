"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActivityExcluded } from "@/app/activities/actions";

/**
 * Run excluded from totals, records and load (illness, mistake or duplicate
 * file): it stays visible with the reason and is restored in one tap. The
 * same button lets you exclude it manually.
 */
export function ExcludedBanner({
  activityId,
  excludedAt,
  reason,
}: {
  activityId: string;
  excludedAt: string | null;
  reason: string | null;
}) {
  const t = useTranslations("activities.excludedBanner");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => startTransition(async () => {
    setError(null);
    const result = await setActivityExcluded(activityId, !excludedAt, excludedAt ? null : t("byAthlete"));
    if (result.error) return setError(result.error);
    router.refresh();
  });

  if (!excludedAt) {
    return (
      <Button type="button" variant="ghost" size="sm" className="-ml-3 text-muted-foreground" disabled={pending} onClick={toggle}>
        <EyeOff size={14} /> {t("exclude")}
      </Button>
    );
  }

  return (
    <div className="surface flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <EyeOff size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">{t("title")}</p>
        {reason && <p className="mt-0.5 text-caption text-muted-foreground">{reason}</p>}
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled={pending} onClick={toggle}>
          <RotateCcw size={14} /> {pending ? t("restoring") : t("restore")}
        </Button>
        {error && <p role="alert" className="mt-2 text-caption text-destructive">{error}</p>}
      </div>
    </div>
  );
}
