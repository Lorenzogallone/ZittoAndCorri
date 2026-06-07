import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { GoalForm } from "./goal-form";

export default async function NewGoalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="Nuovo obiettivo" backHref="/goals" backLabel="Obiettivi" hideTabBar>
      <GoalForm />
    </AppShell>
  );
}
