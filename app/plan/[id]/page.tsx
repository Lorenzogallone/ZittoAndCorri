import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { updateWorkoutStatus } from "../actions";
import { DeleteWorkoutButton } from "./delete-workout-button";
import { formatDuration, formatPace, formatPlannedDistance } from "@/lib/format";
import type { PlannedWorkout } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/activity-meta";

const STATUS_LABELS: Record<string, string> = {
  planned: "Pianificato",
  completed: "Completato",
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlannedWorkoutPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workout } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<PlannedWorkout>();

  if (!workout) notFound();

  return (
    <AppShell title="Allenamento pianificato" backHref="/plan" backLabel="Piano" hideTabBar>
      {/* Header info */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              workout.status === "completed"
                ? "bg-green-500/15 text-green-400"
                : "bg-primary/10 text-primary"
            }`}
          >
            {STATUS_LABELS[workout.status] ?? workout.status}
          </span>
          <span className="text-muted-foreground text-xs">
            {TYPE_LABELS[workout.type] ?? workout.type}
          </span>
        </div>
        <p className="font-semibold text-lg">{formatDate(workout.date)}</p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {/* Distanza sempre mostrata: esplicita o stimata da durata+passo. */}
          {formatPlannedDistance(workout) && (
            <span>{formatPlannedDistance(workout)}</span>
          )}
          {workout.target_pace_s_km != null && (
            <span>{formatPace(workout.target_pace_s_km)}</span>
          )}
          {workout.target_duration_s != null && (
            <span>{formatDuration(workout.target_duration_s)}</span>
          )}
          {workout.target_hr_bpm != null && (
            <span className="text-rose-400">♥ ≤ {workout.target_hr_bpm} bpm</span>
          )}
        </div>

        {workout.description && (
          <p className="mt-3 text-sm text-muted-foreground">{workout.description}</p>
        )}

        {workout.focus && (
          <div className="mt-3 rounded-xl bg-primary/[0.06] border border-primary/15 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
              Focus del coach
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">{workout.focus}</p>
          </div>
        )}
      </div>

      {/* Aggiorna status manuale */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-4 mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
          Aggiorna stato
        </p>
        <div className="flex flex-wrap gap-2">
          {(["planned", "completed"] as const).map((s) => (
            <form key={s} action={updateWorkoutStatus}>
              <input type="hidden" name="id" value={workout.id} />
              <input type="hidden" name="status" value={s} />
              <Button
                type="submit"
                variant={workout.status === s ? "default" : "outline"}
                size="sm"
              >
                {STATUS_LABELS[s]}
              </Button>
            </form>
          ))}
        </div>
      </div>

      {/* Delete con conferma + feedback */}
      <DeleteWorkoutButton workoutId={workout.id} />
    </AppShell>
  );
}
