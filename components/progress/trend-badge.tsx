import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricTrend } from "@/lib/metrics/body-trends";

const TEXT = {
  better: "Migliora",
  worse: "Peggiora",
  stable: "Stabile",
  up: "In aumento",
  down: "In calo",
} as const;

const TONE = {
  better: "text-emerald-600 dark:text-emerald-400",
  worse: "text-orange-600 dark:text-orange-400",
  stable: "text-muted-foreground",
  up: "text-muted-foreground",
  down: "text-muted-foreground",
} as const;

/** Freccia nel verso del numero, colore nel verso del giudizio: la FC a
 *  riposo che scende è una freccia in giù, ma verde. */
export function TrendBadge({ trend, className }: { trend: Pick<MetricTrend, "direction" | "recent" | "previous">; className?: string }) {
  const { direction, recent, previous } = trend;
  if (!direction || recent == null || previous == null) return null;
  const Icon = direction === "stable" ? ArrowRight : recent > previous ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-micro font-semibold", TONE[direction], className)}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {TEXT[direction]}
    </span>
  );
}
