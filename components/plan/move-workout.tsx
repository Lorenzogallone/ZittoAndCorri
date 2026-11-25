"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { CalendarArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveWorkout } from "@/app/plan/actions";
import { addDays } from "@/lib/local-date";

function chipLabel(iso: string, today: string, t: (key: "today" | "tomorrow") => string, locale: Locale): { top: string; day: string } {
  const date = new Date(`${iso}T12:00:00Z`);
  const top = iso === today ? t("today") : iso === addDays(today, 1) ? t("tomorrow") : date.toLocaleDateString(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return { top, day: String(date.getUTCDate()) };
}

/** Moves the session by choosing a day among the next ten. */
export function MoveWorkout({ id, date, today }: { id: string; date: string; today: string }) {
  const t = useTranslations("plan.move");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const days = Array.from({ length: 10 }, (_, index) => addDays(today, index));

  const move = (target: string) => {
    setError(null);
    startTransition(async () => {
      const result = await moveWorkout(id, target);
      if (result.error) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <CalendarArrowUp size={15} />
        {t("button")}
      </Button>
    );
  }

  return (
    <div className="col-span-2 rounded-2xl border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("title")}</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const label = chipLabel(day, today, t, locale);
          const current = day === date;
          return (
            <button
              key={day}
              type="button"
              disabled={current || pending}
              onClick={() => move(day)}
              className={cn(
                "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm transition-colors",
                current ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50",
                pending && "opacity-60",
              )}
              aria-label={current ? t("current", { day }) : t("moveTo", { day })}
            >
              <span className="text-micro uppercase text-muted-foreground">{label.top}</span>
              <span className="font-semibold tabular-nums">{label.day}</span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={() => setOpen(false)}>{t("cancel")}</button>
    </div>
  );
}
