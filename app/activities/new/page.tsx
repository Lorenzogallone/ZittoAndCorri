import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ActivityForm } from "./activity-form";
import type { PlannedWorkout } from "@/lib/types";

export default async function NewActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const minus3 = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const plus3 = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: nearbyWorkouts } = await supabase
    .from("planned_workouts")
    .select("id, date, type, target_distance_m, description")
    .eq("user_id", user.id)
    .eq("status", "planned")
    .gte("date", minus3)
    .lte("date", plus3)
    .order("date")
    .returns<Pick<PlannedWorkout, "id" | "date" | "type" | "target_distance_m" | "description">[]>();

  // Passa today per il confronto date nel form
  return (
    <AppShell
      title="Nuova corsa"
      backHref="/activities"
      backLabel="Corse"
      hideTabBar
    >
      <p className="text-muted-foreground text-sm mb-6">
        Passo e zone sono calcolati in automatico.
      </p>
      <ActivityForm nearbyWorkouts={nearbyWorkouts ?? []} today={today} />
    </AppShell>
  );
}
