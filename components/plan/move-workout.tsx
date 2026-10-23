"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveWorkout } from "@/app/plan/actions";
import { addDays } from "@/lib/local-date";

function chipLabel(iso: string, today: string): { top: string; day: string } {
  const date = new Date(`${iso}T12:00:00Z`);
  const top = iso === today ? "oggi" : iso === addDays(today, 1) ? "domani" : date.toLocaleDateString("it-IT", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return { top, day: String(date.getUTCDate()) };
}

/** Sposta la seduta scegliendo un giorno tra i prossimi dieci. */
export function MoveWorkout({ id, date, today }: { id: string; date: string; today: string }) {
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
        Sposta
      </Button>
    );
  }

  return (
    <div className="col-span-2 rounded-2xl border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Sposta a…</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const label = chipLabel(day, today);
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
              aria-label={current ? `${day} (attuale)` : `Sposta al ${day}`}
            >
              <span className="text-micro uppercase text-muted-foreground">{label.top}</span>
              <span className="font-semibold tabular-nums">{label.day}</span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={() => setOpen(false)}>Annulla</button>
    </div>
  );
}
