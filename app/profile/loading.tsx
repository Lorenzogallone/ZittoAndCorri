import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Stessa forma della pagina: nome, stato di forma, obiettivo e la sezione
// dell'andamento con il grafico.
export default function Loading() {
  return (
    <AppShell title="Profilo">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="surface mb-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-10 w-44" />
        <Skeleton className="mt-3 h-3 w-full" />
      </div>
      <div className="surface mb-8 flex items-center gap-3 px-4 py-4">
        <Skeleton className="h-5 w-5 rounded-md" />
        <div className="flex-1 space-y-1.5"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-4 w-2/3" /></div>
      </div>
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="surface p-4">
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="mt-4 h-44 w-full rounded-xl" />
      </div>
    </AppShell>
  );
}
