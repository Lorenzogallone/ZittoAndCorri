import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: string;
  icon?: ReactNode;
  /** Se presente il segmento è un link (navigazione), altrimenti un bottone. */
  href?: string;
}

/** Controllo a segmenti presentazionale: unico posto per lo stile dei toggle.
 *  Colonne di pari larghezza; per un controllo compatto passare `inline-grid`
 *  in `className`. Senza "use client": da un server component si usa solo con
 *  segmenti `href` (i bottoni con onChange servono un componente client). */
export function Segmented<K extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: SegmentedOption<K>[];
  value: K;
  onChange?: (key: K) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "grid auto-cols-fr grid-flow-col rounded-xl bg-muted p-0.5 font-medium",
        size === "sm" ? "text-xs" : "text-caption",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.key === value;
        const itemClass = cn(
          "flex min-w-0 items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all duration-200",
          size === "sm" ? "px-1.5" : "px-3",
          active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground active:scale-95",
        );
        const content = (
          <>
            {option.icon}
            <span className="truncate">{option.label}</span>
          </>
        );
        return option.href ? (
          <Link key={option.key} href={option.href} role="tab" aria-selected={active} className={itemClass}>
            {content}
          </Link>
        ) : (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(option.key)}
            className={itemClass}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
