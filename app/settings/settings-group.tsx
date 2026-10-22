import type { ReactNode } from "react";

/** Gruppo di impostazioni: titolo piccolo e una superficie con righe separate. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 px-1 text-caption font-medium text-muted-foreground">{title}</h2>}
      <div className="surface divide-y divide-border/60 px-4">{children}</div>
    </section>
  );
}
