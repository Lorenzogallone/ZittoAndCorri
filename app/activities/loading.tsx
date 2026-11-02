import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Stessa forma della pagina: totali (periodi, km, quattro metriche) e un mese
// di corse in una card, una riga per uscita.
export default function Loading() {
  return (
    <AppShell title="Corse">
      <div className="surface mb-8 p-4">
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="mt-5 h-3 w-24" />
        <Skeleton className="mt-2 h-11 w-36" />
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border/60 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-12" /></div>
          ))}
        </div>
      </div>
      <Skeleton className="mb-2 ml-1 h-3 w-28" />
      <div className="surface divide-y divide-border/60 px-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
