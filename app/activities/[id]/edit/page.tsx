import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { isoDateShift } from "@/lib/dates";
import { EditActivityForm } from "./edit-form";
import type { Activity, PlannedWorkout } from "@/lib/types";

type PlannedOption = Pick<
  PlannedWorkout,
  "id" | "date" | "type" | "target_distance_m" | "description"
>;

const PLANNED_SELECT = "id, date, type, target_distance_m, description";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Activity>();

  if (!activity) notFound();

  // Workout pianificati intorno alla DATA DELL'ATTIVITÀ (non a oggi): sono le
  // alternative sensate per il collegamento. In più, quello già collegato
  // (anche se fuori range) per poterlo mostrare/scollegare.
  const activityDay = activity.started_at.slice(0, 10);
  const [{ data: linked }, { data: nearby }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select(PLANNED_SELECT)
      .eq("user_id", user.id)
      .eq("activity_id", activity.id)
      .limit(1)
      .maybeSingle<PlannedOption>(),
    supabase
      .from("planned_workouts")
      .select(PLANNED_SELECT)
      .eq("user_id", user.id)
      .eq("status", "planned")
      .is("activity_id", null)
      .gte("date", isoDateShift(activityDay, -3))
      .lte("date", isoDateShift(activityDay, 3))
      .order("date")
      .returns<PlannedOption[]>(),
  ]);

  const plannedOptions = [
    ...(linked ? [linked] : []),
    ...(nearby ?? []).filter((w) => w.id !== linked?.id),
  ];

  return (
    <AppShell
      title="Modifica attività"
      hideTabBar
      headerAction={
        <Button asChild variant="outline" size="sm">
          <Link href={`/activities/${activity.id}`} replace>
            Annulla
          </Link>
        </Button>
      }
    >
      <p className="text-muted-foreground text-sm mb-6">
        Modifica i dettagli del tuo allenamento. Passo e zone verranno ricalcolati.
      </p>
      <EditActivityForm
        activity={activity}
        plannedOptions={plannedOptions}
        linkedWorkoutId={linked?.id ?? null}
      />
    </AppShell>
  );
}
