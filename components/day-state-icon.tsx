import { Check, Minus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/plan/day-status";

/** Compact indicator of the state of a plan day. */
export function DayStateIcon({ state, size = "md" }: { state: DayState; size?: "sm" | "md" }) {
  const t = useTranslations("plan.dayState");
  const label = t(state);
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? 11 : 13;
  const base = cn("inline-flex shrink-0 items-center justify-center rounded-full", box);
  switch (state) {
    case "done":
      return <span className={cn(base, "bg-primary text-primary-foreground")} title={label} aria-label={label}><Check size={icon} strokeWidth={3} /></span>;
    case "extra":
      return <span className={cn(base, "bg-primary/20 text-primary")} title={label} aria-label={label}><Check size={icon} strokeWidth={3} /></span>;
    case "missed":
      return <span className={cn(base, "border border-muted-foreground/40 text-muted-foreground")} title={label} aria-label={label}><X size={icon} strokeWidth={2.5} /></span>;
    case "today":
      return <span className={cn(base, "border-2 border-primary")} title={label} aria-label={label} />;
    case "planned":
      return <span className={cn(base, "border border-muted-foreground/40")} title={label} aria-label={label} />;
    case "skipped":
      return <span className={cn(base, "border border-dashed border-muted-foreground/50 text-muted-foreground")} title={label} aria-label={label}><Minus size={icon} /></span>;
    case "rest":
      return <span className={base} title={label} aria-label={label}><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /></span>;
  }
}
