import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// Stessa forma della pagina: frase in cima, carico, poi le card con i grafici.
export default function Loading() {
  return (
    <AppShell title="Stato di forma" backHref="/profile" backLabel="Profilo" wide>
      <div className="surface mb-8 p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
      <Skeleton className="mb-3 h-5 w-24" />
      <div className="surface mb-8 p-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-4 h-36 w-full rounded-xl" />
      </div>
      <Skeleton className="mb-3 h-5 w-36" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface p-4"><Skeleton className="h-6 w-24" /><Skeleton className="mt-3 h-24 w-full rounded-xl" /></div>
        <div className="surface p-4"><Skeleton className="h-6 w-24" /><Skeleton className="mt-3 h-24 w-full rounded-xl" /></div>
      </div>
    </AppShell>
  );
}
