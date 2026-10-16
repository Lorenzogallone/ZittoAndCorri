import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell title="Piano">
      <Skeleton className="mb-2 h-5 w-48" />
      <Skeleton className="mb-8 h-1.5 w-full rounded-full" />
      <div className="surface space-y-4 p-4">
        <div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-20" /></div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
