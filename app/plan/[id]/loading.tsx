import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell backHref="/plan" backLabel="Piano" hideTabBar>
      <Skeleton className="mb-2 h-3.5 w-36" />
      <Skeleton className="mb-2 h-9 w-44" />
      <Skeleton className="mb-6 h-3.5 w-32" />
      <Skeleton className="mb-8 h-11 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
      </div>
    </AppShell>
  );
}
