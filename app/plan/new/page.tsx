import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { WorkoutForm } from "./workout-form";
import type { Goal } from "@/lib/types";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function NewWorkoutPage({ searchParams }: Props) {
  const t = await getTranslations("plan");
  const { date } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: goals } = await supabase
    .from("goals")
    .select("id, race_name, is_active")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Pick<Goal, "id" | "race_name" | "is_active">[]>();

  return (
    <AppShell title={t("new.title")} backHref="/plan" backLabel={t("title")} hideTabBar>
      <WorkoutForm goals={goals ?? []} defaultDate={date} />
    </AppShell>
  );
}
