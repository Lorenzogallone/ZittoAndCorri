import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ActivityForm } from "./activity-form";

export const maxDuration = 240;

export default async function NewActivityPage() {
  const t = await getTranslations("activities");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      title={t("new.title")}
      backHref="/activities"
      backLabel={t("backLabel")}
      hideTabBar
    >
      <p className="text-muted-foreground text-sm mb-6">
        {t("new.intro")}
      </p>
      <ActivityForm />
    </AppShell>
  );
}
