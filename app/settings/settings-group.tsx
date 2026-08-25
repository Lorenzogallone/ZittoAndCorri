import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SettingsGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group/settings border-b border-border/70" open={defaultOpen || undefined}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-foreground">
        <span>{title}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-muted-foreground transition-transform group-open/settings:rotate-180"
        />
      </summary>
      <div className="divide-y divide-border/60 pb-2">{children}</div>
    </details>
  );
}
