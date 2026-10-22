import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell backHref="/activities" backLabel="Corse" hideTabBar>
      <Skeleton className="mb-2 h-3.5 w-40" />
      <Skeleton className="mb-6 h-12 w-48" />
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-12" /><Skeleton className="h-5 w-16" /></div>
        ))}
      </div>
      <Skeleton className="mb-4 h-52 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </AppShell>
  );
}
