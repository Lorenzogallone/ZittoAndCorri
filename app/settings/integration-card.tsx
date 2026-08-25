import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";

interface IntegrationCardProps {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}

export function IntegrationCard({
  id,
  icon,
  title,
  description,
  children,
}: IntegrationCardProps) {
  const contentId = id ? `${id}-content` : undefined;

  return (
    <section id={id} className="scroll-mt-6 py-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div id={contentId} className="mt-4 border-t border-border/60 pt-4">
        {children}
      </div>
    </section>
  );
}

export function IntegrationHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-border/60 bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary">
        <Info size={14} />
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
