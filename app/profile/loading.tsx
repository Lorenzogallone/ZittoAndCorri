import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell title="Profilo">
      <div className="surface mb-4 space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="mb-8 h-14 w-full rounded-2xl" />
      <Skeleton className="mb-3 h-5 w-32" />
      <Skeleton className="h-52 w-full rounded-2xl" />
    </AppShell>
  );
}
