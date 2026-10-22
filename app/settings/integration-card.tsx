import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Contenuto di un collegamento: una riga di descrizione e i controlli, senza annidamenti. */
export function IntegrationCard({
  id,
  description,
  children,
}: {
  id?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-6 py-4">
      {description && <p className="mb-4 text-caption leading-relaxed text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

/** Istruzioni facoltative, chiuse di default. */
export function IntegrationHelp({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/help">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-caption font-medium text-primary">
        {title}
        <ChevronDown size={14} className="transition-transform group-open/help:rotate-180" />
      </summary>
      <div className="mt-3 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}
