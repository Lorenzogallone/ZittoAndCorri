import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Pannello nativo: aperto al primo render, richiudibile senza JavaScript. */
export function CollapsibleSection({ title, children, className = "" }: Props) {
  return (
    <details
      open
      className={`group mb-4 rounded-2xl border border-border bg-card p-5 ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none">
        <div className="text-sm font-semibold">{title}</div>
        <ChevronDown
          size={18}
          className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
