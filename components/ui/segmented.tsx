import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: string;
  icon?: ReactNode;
  /** If present the segment is a link (navigation), otherwise a button. */
  href?: string;
}

/** Presentational segmented control: the only place for toggle styling.
 *  Equal-width columns; for a compact control pass `inline-grid`
 *  in `className`. Without "use client": from a server component use it only with
 *  `href` segments (buttons with onChange need a client component). */
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
          "pressable flex min-w-0 items-center justify-center gap-1.5 rounded-lg py-1.5 [--press-scale:0.95]",
          size === "sm" ? "px-1.5" : "px-3",
          active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
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
