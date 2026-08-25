import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";

interface IntegrationCardProps {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function IntegrationCard({
  id,
  icon,
  title,
  description,
  children,
  defaultOpen = false,
}: IntegrationCardProps) {
  const contentId = id ? `${id}-content` : undefined;

  return (
    <details id={id} className="group/item scroll-mt-6" open={defaultOpen || undefined}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-4">
        <span className="shrink-0 text-muted-foreground">
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-normal text-foreground">{title}</h2>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180" />
      </summary>
      <div id={contentId} className="border-t border-border/60 pb-5 pt-4">
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </div>
    </details>
  );
}

export function IntegrationHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/help rounded-xl border border-border/60 bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary">
        <Info size={14} />
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className="text-muted-foreground transition-transform group-open/help:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
