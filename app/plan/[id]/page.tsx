import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { WorkoutGraph } from "@/components/workout-graph";
import { WorkoutSteps } from "@/components/workout-steps";
import { HeatNote } from "@/components/heat-note";
import { MoveWorkout } from "@/components/plan/move-workout";
import { AdaptSheet } from "@/components/plan/adapt-sheet";
import { RacePacingCard } from "@/components/plan/race-pacing";
import { updateWorkoutStatus } from "../actions";
import { DeleteWorkoutButton } from "./delete-workout-button";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { TYPE_LABELS } from "@/lib/activity-meta";
import { WORKOUT_TYPE_GUIDE, workoutHeadline } from "@/lib/workout-guide";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { estimateWorkout } from "@/lib/workout-estimate";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { addDays, relativeDayLabel, romeDay } from "@/lib/local-date";
import { adjustStepsForHeat } from "@/lib/metrics/heat";
import { predictionReference, predictTime } from "@/lib/metrics/race-prediction";
import { heatForDates } from "@/lib/weather";
import type { Activity, Goal, PlannedWorkout } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

const kmText = (meters: number) => `${(meters / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;

export default async function PlannedWorkoutPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workout } = await supabase
    .from("planned_workouts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<PlannedWorkout>();
  if (!workout) notFound();

  const today = romeDay();
  const [{ data: goal }, { data: dayActivities }, heat] = await Promise.all([
    supabase
      .from("goals")
      .select("race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_date" | "distance_m" | "target_time_s">>(),
    supabase
      .from("activities")
      .select("id, started_at, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km")
      .eq("user_id", user.id)
      .gte("started_at", `${addDays(workout.date, -1)}T12:00:00`)
      .lte("started_at", `${addDays(workout.date, 1)}T12:00:00`)
      .order("started_at")
      .returns<Array<Pick<Activity, "id" | "started_at" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km">>>(),
    workout.status === "planned" && workout.type !== "cross"
      ? heatForDates(supabase, user.id, [workout.date]).then((map) => map.get(workout.date) ?? null)
      : Promise.resolve(null),
  ]);

  const baseSteps = workoutStepsOrLegacy(workout.workout_steps, workout);
  const hot = heat && heat.pct > 0 ? heat : null;
  const steps = hot ? adjustStepsForHeat(baseSteps, hot.pct) : baseSteps;
  const headline = workoutHeadline(steps);
  const estimate = estimateWorkout(steps);
  const meters = plannedMeters({ ...workout, workout_steps: steps });
  const seconds = workout.target_duration_s ?? estimate.seconds;
  const fastestPace = steps
    .flatMap((step) => [step.pace_min_s_km, step.pace_max_s_km])
    .filter((pace): pace is number => pace != null)
    .sort((a, b) => a - b)[0] ?? null;
  const done = workout.status === "completed";
  const doneActivity = (dayActivities ?? []).find((activity) =>
    romeDay(activity.started_at) === workout.date && (workout.type === "cross" || activity.sport === "running"));

  // Strategia di gara: tempo obiettivo se è la gara dell'obiettivo, altrimenti previsione.
  const isGoalRace = goal?.race_date === workout.date;
  let race: { distance: number; target: number; source: "goal" | "prediction" } | null = null;
  if (workout.type === "race" || isGoalRace) {
    const distance = isGoalRace ? goal!.distance_m : meters;
    if (isGoalRace && goal?.target_time_s) {
      race = { distance, target: goal.target_time_s, source: "goal" };
    } else if (distance > 0) {
      const { data: recent } = await supabase
        .from("activities")
        .select("id, sport, distance_m, duration_s, moving_time_s, best_efforts")
        .eq("user_id", user.id)
        .eq("sport", "running")
        .gte("started_at", `${addDays(today, -120)}T00:00:00`)
        .returns<Array<Pick<Activity, "id" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "best_efforts">>>();
      const reference = predictionReference((recent ?? []).map((activity) => ({ ...activity, active_s: activeDuration(activity) })));
      if (reference) race = { distance, target: predictTime(reference, distance), source: "prediction" };
    }
  }

  const summary = [
    meters > 0 ? `${workout.target_distance_m ? "" : "≈ "}${kmText(meters)}` : null,
    seconds ? `${Math.round(seconds / 60)} min` : null,
    workout.target_hr_bpm ? `♥ ≤ ${workout.target_hr_bpm}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <AppShell backHref="/plan" backLabel="Piano" hideTabBar>
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{relativeDayLabel(workout.date, today)}</span> · {TYPE_LABELS[workout.type]}
          {workout.adapted_from && workout.status !== "skipped" && " · alleggerita"}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {headline ?? (meters > 0 ? kmText(meters) : TYPE_LABELS[workout.type])}
        </h1>
        {summary && <p className="mt-1 text-sm text-muted-foreground tabular-nums">{summary}</p>}
        {workout.status === "skipped" && <p className="mt-2 text-sm font-medium text-muted-foreground">In pausa: ripristinala dal piano quando stai meglio.</p>}
      </header>

      {steps.length > 0 && <WorkoutGraph steps={steps} type={workout.type} className="mb-6" />}
      {hot && <div className="mb-6"><HeatNote heat={hot} referencePace={fastestPace} /></div>}

      {doneActivity && (
        <Link href={`/activities/${doneActivity.id}`} className="mb-6 flex items-center gap-3 rounded-2xl bg-primary/[0.07] px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check size={15} strokeWidth={3} /></span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Fatta</span>
            <span className="text-muted-foreground tabular-nums">
              {" · "}{doneActivity.distance_m > 0 ? formatDistance(doneActivity.distance_m) : formatDuration(activeDuration(doneActivity))}
              {doneActivity.avg_pace_s_km ? ` · ${formatPace(doneActivity.avg_pace_s_km)}` : ""}
            </span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      )}

      {workout.description && (
        <Section title="Cosa fare e perché">
          <p className="text-sm leading-relaxed text-foreground/90">{workout.description}</p>
        </Section>
      )}

      {steps.length > 0 && (
        <Section title="Come si svolge">
          <WorkoutSteps steps={steps} type={workout.type} />
        </Section>
      )}

      {workout.focus && (
        <Section title="Su cosa concentrarti">
          <p className="text-sm leading-relaxed text-foreground/90">{workout.focus}</p>
        </Section>
      )}

      {race && <RacePacingCard distance_m={race.distance} target_s={race.target} source={race.source} heatPct={hot?.pct ?? 0} />}

      {WORKOUT_TYPE_GUIDE[workout.type] && (
        <details className="group mb-8 text-sm">
          <summary className="cursor-pointer list-none text-muted-foreground">
            Che cos&apos;è una seduta «{TYPE_LABELS[workout.type].toLowerCase()}»? <span className="text-primary">Leggi</span>
          </summary>
          <p className="mt-2 leading-relaxed text-foreground/90">{WORKOUT_TYPE_GUIDE[workout.type]}</p>
        </details>
      )}

      {workout.status !== "skipped" && (
        <div className="grid grid-cols-2 gap-2">
          <form action={updateWorkoutStatus} className="col-span-2">
            <input type="hidden" name="id" value={workout.id} />
            <input type="hidden" name="status" value={done ? "planned" : "completed"} />
            <Button type="submit" variant={done ? "outline" : "default"} className="w-full">
              <Check size={16} /> {done ? "Segnata come fatta · annulla" : "Segna come fatta"}
            </Button>
          </form>
          {!done && workout.date >= today && (
            <>
              <MoveWorkout id={workout.id} date={workout.date} today={today} />
              <AdaptSheet variant="inline" />
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <DeleteWorkoutButton workoutId={workout.id} />
      </div>
    </AppShell>
  );
}
