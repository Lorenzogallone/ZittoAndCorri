import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { EditGoalForm } from "./goal-form";
import type { Goal } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditGoalPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Goal>();

  if (!goal) notFound();

  return (
    <AppShell title="Modifica obiettivo" backHref="/goals" backLabel="Obiettivi" hideTabBar>
      <EditGoalForm goal={goal} />
    </AppShell>
  );
}
