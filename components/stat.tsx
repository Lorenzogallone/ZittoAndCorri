import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const VALUE_SIZE = {
  sm: "text-body font-semibold",
  md: "text-2xl leading-none font-semibold",
  lg: "text-display font-bold",
} as const;

/** Metrica: etichetta eyebrow sopra, valore in display con l'unità accanto.
 *  `tone="hero"` per le card inchiostro (etichetta e unità in --hero-muted). */
export function Stat({
  label,
  value,
  unit,
  icon: Icon,
  size = "md",
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "hero";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow flex items-center gap-1" data-tone={tone === "hero" ? "hero" : undefined}>
        {Icon && <Icon size={14} strokeWidth={2.2} className="shrink-0 text-primary" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-1 flex items-baseline gap-1 font-display tabular-nums tracking-tight", VALUE_SIZE[size])}>
        <span>{value}</span>
        {unit && (
          <span
            className={cn(
              "font-sans text-caption font-medium tracking-normal",
              tone === "hero" ? "text-hero-muted" : "text-muted-foreground",
            )}
          >
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
