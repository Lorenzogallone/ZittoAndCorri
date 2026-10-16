import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/plan/day-status";

const LABELS: Record<DayState, string> = {
  done: "Fatto",
  missed: "Saltato",
  today: "Oggi",
  planned: "In programma",
  rest: "Riposo",
  extra: "Attività extra",
  skipped: "In pausa",
};

/** Indicatore compatto dello stato di un giorno del piano. */
export function DayStateIcon({ state, size = "md" }: { state: DayState; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? 11 : 13;
  const base = cn("inline-flex shrink-0 items-center justify-center rounded-full", box);
  switch (state) {
    case "done":
      return <span className={cn(base, "bg-primary text-primary-foreground")} title={LABELS[state]} aria-label={LABELS[state]}><Check size={icon} strokeWidth={3} /></span>;
    case "extra":
      return <span className={cn(base, "bg-primary/20 text-primary")} title={LABELS[state]} aria-label={LABELS[state]}><Check size={icon} strokeWidth={3} /></span>;
    case "missed":
      return <span className={cn(base, "border border-muted-foreground/40 text-muted-foreground")} title={LABELS[state]} aria-label={LABELS[state]}><X size={icon} strokeWidth={2.5} /></span>;
    case "today":
      return <span className={cn(base, "border-2 border-primary")} title={LABELS[state]} aria-label={LABELS[state]} />;
    case "planned":
      return <span className={cn(base, "border border-muted-foreground/40")} title={LABELS[state]} aria-label={LABELS[state]} />;
    case "skipped":
      return <span className={cn(base, "border border-dashed border-muted-foreground/50 text-muted-foreground")} title={LABELS[state]} aria-label={LABELS[state]}><Minus size={icon} /></span>;
    case "rest":
      return <span className={base} title={LABELS[state]} aria-label={LABELS[state]}><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /></span>;
  }
}

export { LABELS as DAY_STATE_LABELS };
