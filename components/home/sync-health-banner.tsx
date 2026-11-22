import Link from "next/link";
import { CloudOff } from "lucide-react";
import type { SyncIssue } from "@/lib/sync-health";
import { cn } from "@/lib/utils";

/**
 * Avviso compatto "dati fermi": una riga con il problema più importante e il
 * link alle impostazioni dell'integrazione. Non compare se è tutto a posto.
 */
export function SyncHealthBanner({ issues, className }: { issues: SyncIssue[]; className?: string }) {
  const [issue] = issues;
  if (!issue) return null;
  const others = issues.length - 1;
  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3", className)}>
      <CloudOff size={18} aria-hidden className="shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-sm leading-snug" title={issues.map((item) => item.text).join("\n")}>
        {issue.text}
        {others > 0 && <span className="text-muted-foreground"> · +{others}</span>}
      </p>
      <Link href={issue.href} className="shrink-0 text-sm font-medium text-primary">
        Controlla
      </Link>
    </div>
  );
}
