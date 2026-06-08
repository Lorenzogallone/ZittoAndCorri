import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  updateWorkoutStatus,
  linkActivityToWorkout,
  unlinkActivityFromWorkout,
  deletePlannedWorkout,
} from "../actions";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { PlannedWorkout, Activity } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

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

  // Corse nei ±3 giorni dalla data del workout (copre il caso "l'ho fatta il
  // giorno dopo"). Escluse le corse già collegate ad altri workout.
  const workoutDate = new Date(workout.date + "T00:00:00");
  const fromDate = new Date(workoutDate);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(workoutDate);
  toDate.setDate(toDate.getDate() + 3);
  const { data: nearbyActivities } = await supabase
    .from("activities")
    .select("id, started_at, type, distance_m, duration_s")
    .eq("user_id", user.id)
    .gte("started_at", fromDate.toISOString().slice(0, 10) + "T00:00:00")
    .lte("started_at", toDate.toISOString().slice(0, 10) + "T23:59:59")
    .order("started_at", { ascending: false })
    .returns<Pick<Activity, "id" | "started_at" | "type" | "distance_m" | "duration_s">[]>();

  const linkedActivity = workout.activity_id
    ? { id: workout.activity_id }
    : null;

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
          {workout.target_distance_m != null && (
            <span>{formatDistance(workout.target_distance_m)}</span>
          )}
          {workout.target_pace_s_km != null && (
            <span>{formatPace(workout.target_pace_s_km)}</span>
          )}
          {workout.target_duration_s != null && (
            <span>{formatDuration(workout.target_duration_s)}</span>
          )}
        </div>

        {workout.description && (
          <p className="mt-3 text-sm text-muted-foreground">{workout.description}</p>
        )}
      </div>

      {/* Link corsa completata */}
      {linkedActivity && (
        <div className="rounded-2xl bg-green-500/5 border border-green-500/20 p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-2">Corsa collegata</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link href={`/activities/${linkedActivity.id}`}>
                Vai al dettaglio corsa →
              </Link>
            </Button>
            <form action={unlinkActivityFromWorkout}>
              <input type="hidden" name="workout_id" value={workout.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                Scollega
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Collega attività (solo se planned e nessuna attività linkata) */}
      {workout.status === "planned" && !workout.activity_id && nearbyActivities && nearbyActivities.length > 0 && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-4 mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Collega una corsa
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Corse nel periodo vicino alla data pianificata (±3 giorni).
          </p>
          <form action={linkActivityToWorkout} className="flex flex-col gap-3">
            <input type="hidden" name="workout_id" value={workout.id} />
            <Select name="activity_id">
              <SelectTrigger>
                <SelectValue placeholder="Seleziona corsa…" />
              </SelectTrigger>
              <SelectContent>
                {nearbyActivities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {new Date(a.started_at).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}
                    {" — "}
                    {TYPE_LABELS[a.type] ?? a.type} — {formatDistance(a.distance_m)} — {formatDuration(a.duration_s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm">
              Collega e segna completato
            </Button>
          </form>
        </div>
      )}

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

      {/* Delete */}
      <form action={deletePlannedWorkout}>
        <input type="hidden" name="id" value={workout.id} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
        >
          Elimina allenamento
        </Button>
      </form>
    </AppShell>
  );
}
