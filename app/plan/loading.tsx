import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Stessa forma della pagina: obiettivo con le fasi, selettore della vista e
// la settimana corrente in una card, un giorno per riga.
export default function Loading() {
  return (
    <AppShell title="Piano">
      <div className="mb-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mb-4 mt-2 h-3 w-40" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-44 rounded-xl" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="surface mb-6 px-4 pb-1 pt-4">
        <div className="mb-2 flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-20" /></div>
        <Skeleton className="mb-1 h-1 w-full rounded-full" />
        <div className="divide-y divide-border/60">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="flex w-9 shrink-0 flex-col items-center gap-1"><Skeleton className="h-2.5 w-6" /><Skeleton className="h-4 w-5" /></div>
              <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
