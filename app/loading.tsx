import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback della home: stessa forma della pagina vera (saluto, card della
// seduta, settimana, chat), così il passaggio è morbido.
export default function Loading() {
  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="mb-5 flex items-center justify-between pt-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="mb-6 space-y-3">
          {/* Card inchiostro: segnaposto chiari fissi, lo shimmer è pensato per le superfici chiare. */}
          <div className="surface-hero space-y-3 p-5">
            <div className="h-3 w-28 rounded-md bg-white/10" />
            <div className="h-10 w-40 rounded-md bg-white/10" />
            <div className="h-7 w-full rounded-md bg-white/10" />
          </div>
          <div className="surface space-y-3 px-4 py-3">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="mx-auto h-5 w-5 rounded-full" />)}
            </div>
          </div>
        </div>
        <Skeleton className="min-h-40 flex-1 rounded-3xl" />
      </div>
    </AppShell>
  );
}
