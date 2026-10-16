import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell title="Corse">
      <div className="surface mb-8 space-y-3 p-4">
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-3 w-52" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
