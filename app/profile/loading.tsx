import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell title="Profilo">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-36" />
      </div>
      {/* Card inchiostro dello stato di forma: segnaposto chiari fissi. */}
      <div className="surface-hero mb-3 space-y-3 p-5">
        <div className="h-3 w-24 rounded-md bg-white/10" />
        <div className="h-10 w-44 rounded-md bg-white/10" />
        <div className="h-3 w-full rounded-md bg-white/10" />
      </div>
      <Skeleton className="mb-8 h-14 w-full rounded-2xl" />
      <Skeleton className="mb-3 h-5 w-32" />
      <Skeleton className="h-52 w-full rounded-2xl" />
    </AppShell>
  );
}
