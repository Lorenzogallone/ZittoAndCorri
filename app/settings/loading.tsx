import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Loading() {
  const t = await getTranslations("settings");
  return (
    <AppShell title={t("title")} backHref="/profile" backLabel={t("backLabel")} hideTabBar>
      <Skeleton className="mb-6 h-9 w-full rounded-xl" />
      <div className="surface space-y-5 p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between"><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-11 rounded-full" /></div>
        ))}
      </div>
    </AppShell>
  );
}
