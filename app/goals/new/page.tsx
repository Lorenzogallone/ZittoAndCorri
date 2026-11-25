import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { GoalForm } from "./goal-form";

export default async function NewGoalPage() {
  const t = await getTranslations("goals");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell title={t("new.title")} backHref="/goals" backLabel={t("title")} hideTabBar>
      <GoalForm />
    </AppShell>
  );
}
