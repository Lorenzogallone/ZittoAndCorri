import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/i18n/config";
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PlanCalendar } from "@/components/plan-calendar";
import { PlanWeek, type PlanActivity } from "@/components/plan/week-list";
import { PhaseBar } from "@/components/plan/phase-bar";
import { AdaptSheet } from "@/components/plan/adapt-sheet";
import { AdaptationBanner } from "@/components/plan/adaptation-banner";
import { EmptyState } from "@/components/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/format";
import { addDays, daysBetween, mondayOf, romeDay } from "@/lib/local-date";
import { buildDays } from "@/lib/plan/day-status";
import { matchWindow } from "@/lib/plan/match-activities";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { trainingPhases } from "@/lib/plan/phases";
import type { Goal, PlannedWorkout } from "@/lib/types";

interface Props {
  searchParams: Promise<{ view?: string; month?: string; week?: string }>;
}

const isIsoDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

function rangeLabel(start: string, end: string, locale: Locale): string {
  const format = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  return `${format(start)} – ${format(end)}`;
}

export default async function PlanPage({ searchParams }: Props) {
  const t = await getTranslations("plan");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const view = params.view === "month" ? "month" : "weeks";
  const today = romeDay();
  const thisMonday = mondayOf(today);
  const firstMonday = isIsoDate(params.week) ? mondayOf(params.week) : thisMonday;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7);

  const [rangeStart, dayCount] = view === "month"
    ? [`${month}-01`, daysBetween(`${month}-01`, addDays(`${month}-01`, 31).slice(0, 7) + "-01")]
    : [firstMonday, 14];
  const rangeEnd = addDays(rangeStart, dayCount - 1);
  // Sedute e corse anche attorno all'intervallo: una seduta vale fatta con una
  // corsa fino a due giorni prima o dopo, anche a cavallo dei bordi.
  const matchRange = matchWindow(rangeStart, rangeEnd);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: workouts }, { data: activities }, { data: goal }, { data: adapted }, { count: upcoming }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", matchRange.from)
      .lte("date", matchRange.to)
      .order("date")
      .order("created_at")
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km")
      .eq("user_id", user.id)
      .is("excluded_at", null)
      .gte("started_at", `${addDays(matchRange.from, -1)}T00:00:00`)
      .lte("started_at", `${addDays(matchRange.to, 1)}T23:59:59`)
      .order("started_at")
      .returns<PlanActivity[]>(),
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "created_at">>(),
    supabase
      .from("planned_workouts")
      .select("adapted_from, status")
      .eq("user_id", user.id)
      .not("adapted_from", "is", null)
      .gte("date", today)
      .returns<Array<Pick<PlannedWorkout, "adapted_from" | "status">>>(),
    supabase.from("planned_workouts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("date", today),
  ]);

  const days = buildDays(rangeStart, dayCount, today, workouts ?? [], activities ?? [], (workout) => workoutStepsOrLegacy(workout.workout_steps, workout));
  const adaptationUntil = (adapted ?? [])
    .map((row) => String(row.adapted_from?.until ?? ""))
    .filter(Boolean)
    .sort()
    .at(-1);
  const phases = goal ? trainingPhases({
    race_date: goal.race_date,
    distance_m: goal.distance_m,
    start_date: romeDay(goal.created_at),
    today,
  }) : null;
  const daysToRace = goal?.race_date ? daysBetween(today, goal.race_date) : null;
  // Niente in programma da oggi in poi (vista che include oggi): invito a
  // chiedere un piano; senza nulla nemmeno nell'intervallo, solo l'invito.
  const nothingPlanned = upcoming === 0 && rangeStart <= today && today <= rangeEnd;
  const rangeEmpty = days.every((day) => !day.workouts.length && !day.activities.length);

  return (
    <AppShell title={t("title")} headerAction={<AdaptSheet />} wide>
      {adaptationUntil && (
        <AdaptationBanner until={adaptationUntil} paused={(adapted ?? []).some((row) => row.status === "skipped")} />
      )}

      {goal ? (
        <Link href="/goals" className="mb-8 block">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-title font-bold tracking-tight">{goal.race_name}</p>
            {daysToRace != null && daysToRace >= 0 && (
              <p className="shrink-0 font-display text-heading font-bold tabular-nums tracking-tight text-primary">
                {daysToRace === 0 ? t("page.today") : daysToRace < 14 ? t("page.inDays", { days: daysToRace }) : t("page.inWeeks", { weeks: Math.ceil(daysToRace / 7) })}
              </p>
            )}
          </div>
          <p className="mb-4 mt-1 text-caption text-muted-foreground tabular-nums">
            {goal.race_date
              ? t("page.goalMeta", {
                distance: formatDistance(goal.distance_m, locale),
                date: new Date(`${goal.race_date}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
              })
              : t("page.goalMetaNoDate", { distance: formatDistance(goal.distance_m, locale) })}
          </p>
          {phases && <PhaseBar plan={phases} />}
        </Link>
      ) : (
        <Link href={`/?prompt=${encodeURIComponent(t("page.promptSetGoal"))}`} className="surface mb-8 flex items-center justify-between px-4 py-3 text-body text-muted-foreground">
          {t("page.noGoal")}
          <ChevronRight size={16} />
        </Link>
      )}

      {nothingPlanned && (
        <EmptyState
          icon={CalendarDays}
          title={t("page.empty.title")}
          text={t("page.empty.text")}
          action={{ href: `/?prompt=${encodeURIComponent(t("page.promptMakePlan"))}`, label: t("page.empty.action"), icon: MessageCircle }}
          secondary={{ href: "/plan/new", label: t("page.empty.secondary"), icon: Plus }}
          className="mb-8"
        />
      )}

      {!(nothingPlanned && rangeEmpty) && (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            <Segmented
              className="inline-grid"
              ariaLabel={t("page.view.label")}
              value={view}
              options={[
                { key: "weeks", label: t("page.view.weeks"), href: "/plan" },
                { key: "month", label: t("page.view.month"), href: "/plan?view=month" },
              ]}
            />
            {view === "weeks" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link href={`/plan?week=${addDays(firstMonday, -14)}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label={t("page.previousWeeks")}>
                  <ChevronLeft size={17} />
                </Link>
                {firstMonday === thisMonday ? (
                  <span className="tabular-nums">{rangeLabel(rangeStart, rangeEnd, locale)}</span>
                ) : (
                  <Link href="/plan" className="font-medium text-primary">{t("page.backToToday")}</Link>
                )}
                <Link href={`/plan?week=${addDays(firstMonday, 14)}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label={t("page.nextWeeks")}>
                  <ChevronRight size={17} />
                </Link>
              </div>
            )}
          </div>

          {view === "weeks" ? (
            // Da lg le due settimane affiancate; da 2xl una sopra l'altra, ognuna
            // con i sette giorni in riga (vedi PlanWeek).
            <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 2xl:grid-cols-1 2xl:gap-0">
              {[days.slice(0, 7), days.slice(7, 14)].map((week, index) => {
                const isCurrent = week[0].date === thisMonday;
                const isNext = week[0].date === addDays(thisMonday, 7);
                return (
                  <PlanWeek
                    key={week[0].date}
                    days={week}
                    today={today}
                    highlight={isCurrent}
                    title={isCurrent ? t("page.thisWeek") : isNext && index > 0 ? t("page.nextWeek") : undefined}
                  />
                );
              })}
            </div>
          ) : (
            <div className="surface p-4">
              <PlanCalendar days={days} month={month} today={today} raceDate={goal?.race_date ?? null} />
            </div>
          )}
        </>
      )}

      {!nothingPlanned && (
        <Button asChild variant="outline" className="mt-2 w-full lg:w-auto">
          <Link href="/plan/new">
            <Plus size={16} /> {t("page.addWorkout")}
          </Link>
        </Button>
      )}
    </AppShell>
  );
}
