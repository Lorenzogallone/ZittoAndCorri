import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback della home: stessa forma della pagina vera (saluto, scheda della
// seduta con la settimana, chat), così il passaggio è morbido.
export default function Loading() {
  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between pt-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="surface mb-3 space-y-3 p-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-7 w-full" />
          <div className="grid grid-cols-7 gap-2 pt-2">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="mx-auto h-5 w-5 rounded-full" />)}
          </div>
        </div>
        <Skeleton className="min-h-40 flex-1 rounded-3xl" />
      </div>
    </AppShell>
  );
}
