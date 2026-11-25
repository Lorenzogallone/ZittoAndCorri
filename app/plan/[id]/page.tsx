import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/i18n/config";
import { Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/section";
import { WorkoutGraph } from "@/components/workout-graph";
import { WorkoutSteps } from "@/components/workout-steps";
import { HeatNote } from "@/components/heat-note";
import { MoveWorkout } from "@/components/plan/move-workout";
import { AdaptSheet } from "@/components/plan/adapt-sheet";
import { RacePacingCard } from "@/components/plan/race-pacing";
import { updateWorkoutStatus } from "../actions";
import { DeleteWorkoutButton } from "./delete-workout-button";
import { MarkDoneButton } from "./mark-done-button";
import { activeDuration, formatDistance, formatDuration, formatPace } from "@/lib/format";
import { typeLabel } from "@/lib/activity-meta";
import { workoutTypeGuide, workoutHeadline } from "@/lib/workout-guide";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { estimateWorkout } from "@/lib/workout-estimate";
import { plannedMeters } from "@/lib/plan/planned-distance";
import { addDays, relativeDayLabel, romeDay, weekdayName } from "@/lib/local-date";
import { adjustStepsForHeat } from "@/lib/metrics/heat";
import { enduranceBase, goalRaceRange, predictionReference, predictTimeRange } from "@/lib/metrics/race-prediction";
import { heatForDates } from "@/lib/weather";
import type { Activity, Goal, PlannedWorkout } from "@/lib/types";
import { matchPlan, matchWindow, withinWindow } from "@/lib/plan/match-activities";

interface Props {
  params: Promise<{ id: string }>;
}

const kmText = (meters: number, locale: Locale) => `${(meters / 1000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 })} km`;

export default async function PlannedWorkoutPage({ params }: Props) {
  const t = await getTranslations("plan");
  const tl = await getTranslations("labels");
  const locale = (await getLocale()) as Locale;
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
  // Sedute e corse attorno al giorno: la seduta vale fatta anche con una corsa
  // fino a due giorni prima o dopo (matchPlan).
  const range = matchWindow(workout.date);
  const [{ data: goal }, { data: dayActivities }, { data: dayWorkouts }, heat] = await Promise.all([
    supabase
      .from("goals")
      .select("race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_date" | "distance_m" | "target_time_s">>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km")
      .eq("user_id", user.id)
      .is("excluded_at", null)
      .gte("started_at", `${addDays(range.from, -1)}T12:00:00`)
      .lte("started_at", `${addDays(range.to, 1)}T12:00:00`)
      .order("started_at")
      .returns<Array<Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km">>>(),
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", range.from)
      .lte("date", range.to)
      .returns<PlannedWorkout[]>(),
    workout.status === "planned" && workout.type !== "cross"
      ? heatForDates(supabase, user.id, [workout.date]).then((map) => map.get(workout.date) ?? null)
      : Promise.resolve(null),
  ]);

  const baseSteps = workoutStepsOrLegacy(workout.workout_steps, workout);
  const hot = heat && heat.pct > 0 ? heat : null;
  const steps = hot ? adjustStepsForHeat(baseSteps, hot.pct) : baseSteps;
  const headline = workoutHeadline(steps, locale);
  const estimate = estimateWorkout(steps);
  const meters = plannedMeters({ ...workout, workout_steps: steps });
  const seconds = workout.target_duration_s ?? estimate.seconds;
  const fastestPace = steps
    .flatMap((step) => [step.pace_min_s_km, step.pace_max_s_km])
    .filter((pace): pace is number => pace != null)
    .sort((a, b) => a - b)[0] ?? null;
  const done = workout.status === "completed";
  // Con più sedute e più corse nello stesso giorno, la corsa che somiglia di
  // più a questa seduta (non per forza la prima del giorno).
  // Se non c'è, una corsa dello stesso tipo fino a due giorni prima o dopo.
  const nearbyWorkouts = dayWorkouts?.some((w) => w.id === workout.id) ? dayWorkouts : [...(dayWorkouts ?? []), workout];
  const matchedId = matchPlan(
    nearbyWorkouts.map((w) => ({ ...w, workout_steps: workoutStepsOrLegacy(w.workout_steps, w) })),
    withinWindow(dayActivities ?? [], range),
  ).get(workout.id);
  const doneActivity = (dayActivities ?? []).find((activity) => activity.id === matchedId);
  const doneDay = doneActivity ? romeDay(doneActivity.started_at) : null;

  // Strategia di gara: tempo obiettivo se è la gara dell'obiettivo, altrimenti previsione.
  const isGoalRace = goal?.race_date === workout.date;
  let race: { distance: number; target: number; source: "goal" | "prediction"; advice?: string } | null = null;
  if (workout.type === "race" || isGoalRace) {
    const distance = isGoalRace ? goal!.distance_m : meters;
    const goalTarget = isGoalRace ? goal?.target_time_s ?? null : null;
    if (distance > 0) {
      const { data: recent } = await supabase
        .from("activities")
        .select("id, sport, started_at, distance_m, duration_s, moving_time_s, best_efforts, hr_drift_pct, intervals")
        .eq("user_id", user.id)
        .eq("sport", "running")
        .is("excluded_at", null)
        .gte("started_at", `${addDays(today, -120)}T00:00:00`)
        .returns<Array<Pick<Activity, "id" | "sport" | "started_at" | "distance_m" | "duration_s" | "moving_time_s" | "best_efforts" | "hr_drift_pct" | "intervals">>>();
      const reference = predictionReference((recent ?? []).map((activity) => ({ ...activity, active_s: activeDuration(activity) })));
      const base = enduranceBase(recent ?? [], today);
      if (goalTarget) {
        // Tempo obiettivo, ma con accanto il passo di partenza onesto della
        // previsione: lo stesso consiglio che si legge nel profilo.
        const advice = reference ? goalRaceRange(reference, base, { distance_m: distance, target_time_s: goalTarget }, today, await getTranslations("metrics"), locale).advice_text : undefined;
        race = { distance, target: goalTarget, source: "goal", advice };
      } else if (reference) {
        // Stima centrale della forbice: tiene conto di volume e lungo, non solo di Riegel.
        race = { distance, target: predictTimeRange(reference, distance, base, today).central_s, source: "prediction" };
      }
    } else if (goalTarget) {
      race = { distance, target: goalTarget, source: "goal" };
    }
  }

  const summary = [
    meters > 0 ? `${workout.target_distance_m ? "" : "≈ "}${kmText(meters, locale)}` : null,
    seconds ? `${Math.round(seconds / 60)} min` : null,
    workout.target_hr_bpm ? `♥ ≤ ${workout.target_hr_bpm}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <AppShell backHref="/plan" backLabel={t("title")} hideTabBar wide>
      {/* Desktop: titolo e grafico della seduta a sinistra, sotto le
          indicazioni (in due colonne da 2xl); a destra corsa fatta e azioni.
          Sul telefono i gruppi non generano box (contents): ordine invariato. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr_auto] lg:gap-x-8 2xl:grid-cols-[minmax(0,1fr)_24rem] 3xl:gap-x-10">
      <div className="contents lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{relativeDayLabel(workout.date, today, locale)}</span> · {typeLabel(tl, workout.type)}
          {workout.adapted_from && workout.status !== "skipped" && ` · ${t("detail.lightened")}`}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {headline ?? (meters > 0 ? kmText(meters, locale) : typeLabel(tl, workout.type))}
        </h1>
        {summary && <p className="mt-1 text-sm text-muted-foreground tabular-nums">{summary}</p>}
        {workout.status === "skipped" && <p className="mt-2 text-sm font-medium text-muted-foreground">{t("detail.paused")}</p>}
      </header>

      {steps.length > 0 && <WorkoutGraph steps={steps} type={workout.type} className="mb-6" />}
      {hot && <div className="mb-6"><HeatNote heat={hot} referencePace={fastestPace} /></div>}
      </div>

      <div className="contents lg:col-start-2 lg:row-start-1 lg:block">

      {doneActivity && (
        <Link href={`/activities/${doneActivity.id}`} className="pressable animate-enter mb-6 flex items-center gap-3 rounded-2xl bg-primary/[0.07] px-4 py-3">
          <span className="animate-pop flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check size={15} strokeWidth={3} /></span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{doneDay && doneDay !== workout.date ? t("detail.doneOn", { weekday: weekdayName(doneDay, locale) }) : t("detail.done")}</span>
            <span className="text-muted-foreground tabular-nums">
              {" · "}{doneActivity.distance_m > 0 ? formatDistance(doneActivity.distance_m, locale) : formatDuration(activeDuration(doneActivity))}
              {doneActivity.avg_pace_s_km ? ` · ${formatPace(doneActivity.avg_pace_s_km)}` : ""}
            </span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      )}
      </div>

      <div className="contents lg:col-start-1 lg:row-start-3 lg:block 2xl:columns-2 2xl:gap-x-8 2xl:[&>*]:break-inside-avoid">

      {workout.description && (
        <Section title={t("detail.sections.what")}>
          <p className="text-sm leading-relaxed text-foreground/90">{workout.description}</p>
        </Section>
      )}

      {steps.length > 0 && (
        <Section title={t("detail.sections.how")}>
          <WorkoutSteps steps={steps} type={workout.type} />
        </Section>
      )}

      {workout.focus && (
        <Section title={t("detail.sections.focus")}>
          <p className="text-sm leading-relaxed text-foreground/90">{workout.focus}</p>
        </Section>
      )}

      {race && <RacePacingCard distance_m={race.distance} target_s={race.target} source={race.source} advice={race.advice} heatPct={hot?.pct ?? 0} />}

      <details className="group mb-8 text-sm">
        <summary className="cursor-pointer list-none text-muted-foreground">
          {t.rich("detail.typeGuide", {
            type: typeLabel(tl, workout.type).toLowerCase(),
            read: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </summary>
        <p className="mt-2 leading-relaxed text-foreground/90">{workoutTypeGuide(tl, workout.type)}</p>
      </details>
      </div>

      <div className="contents lg:col-start-2 lg:row-start-2 lg:block lg:self-start">

      {workout.status !== "skipped" && (
        <div className="grid grid-cols-2 gap-2">
          <form action={updateWorkoutStatus} className="col-span-2">
            <input type="hidden" name="id" value={workout.id} />
            <input type="hidden" name="status" value={done ? "planned" : "completed"} />
            <MarkDoneButton done={done} />
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
      </div>
      </div>
    </AppShell>
  );
}
