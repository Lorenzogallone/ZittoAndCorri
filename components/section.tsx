import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Blocco di pagina con titolo: separa i contenuti senza card annidate.
 *  Unico componente per le sezioni titolate (piano, profilo…). */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-heading font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
