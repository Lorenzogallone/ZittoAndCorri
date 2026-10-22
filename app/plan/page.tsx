import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PlanCalendar } from "@/components/plan-calendar";
import { PlanWeek, type PlanActivity } from "@/components/plan/week-list";
import { PhaseBar } from "@/components/plan/phase-bar";
import { AdaptSheet } from "@/components/plan/adapt-sheet";
import { AdaptationBanner } from "@/components/plan/adaptation-banner";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/format";
import { addDays, daysBetween, mondayOf, romeDay } from "@/lib/local-date";
import { buildDays } from "@/lib/plan/day-status";
import { trainingPhases } from "@/lib/plan/phases";
import type { Goal, PlannedWorkout } from "@/lib/types";

interface Props {
  searchParams: Promise<{ view?: string; month?: string; week?: string }>;
}

const isIsoDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

function rangeLabel(start: string, end: string): string {
  const format = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${format(start)} – ${format(end)}`;
}

export default async function PlanPage({ searchParams }: Props) {
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: workouts }, { data: activities }, { data: goal }, { data: adapted }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date")
      .order("created_at")
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km")
      .eq("user_id", user.id)
      .gte("started_at", `${addDays(rangeStart, -1)}T00:00:00`)
      .lte("started_at", `${addDays(rangeEnd, 1)}T23:59:59`)
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
  ]);

  const days = buildDays(rangeStart, dayCount, today, workouts ?? [], activities ?? []);
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

  return (
    <AppShell title="Piano" headerAction={<AdaptSheet />}>
      {adaptationUntil && (
        <AdaptationBanner until={adaptationUntil} paused={(adapted ?? []).some((row) => row.status === "skipped")} />
      )}

      {goal ? (
        <Link href="/goals" className="mb-8 block">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-title font-bold tracking-tight">{goal.race_name}</p>
            {daysToRace != null && daysToRace >= 0 && (
              <p className="shrink-0 font-display text-heading font-bold tabular-nums tracking-tight text-primary">
                {daysToRace === 0 ? "Oggi" : daysToRace < 14 ? `tra ${daysToRace} giorni` : `${Math.ceil(daysToRace / 7)} settimane`}
              </p>
            )}
          </div>
          <p className="mb-4 mt-1 text-caption text-muted-foreground tabular-nums">
            {formatDistance(goal.distance_m)}
            {goal.race_date
              ? ` · ${new Date(`${goal.race_date}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`
              : " · obiettivo senza data"}
          </p>
          {phases && <PhaseBar plan={phases} />}
        </Link>
      ) : (
        <Link href="/?prompt=Vorrei+impostare+un+obiettivo" className="surface mb-8 flex items-center justify-between px-4 py-3 text-body text-muted-foreground">
          Nessun obiettivo · parlane al coach
          <ChevronRight size={16} />
        </Link>
      )}

      <div className="mb-5 flex items-center justify-between gap-3">
        <Segmented
          className="inline-grid"
          ariaLabel="Vista"
          value={view}
          options={[
            { key: "weeks", label: "Settimane", href: "/plan" },
            { key: "month", label: "Mese", href: "/plan?view=month" },
          ]}
        />
        {view === "weeks" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href={`/plan?week=${addDays(firstMonday, -14)}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Settimane precedenti">
              <ChevronLeft size={17} />
            </Link>
            {firstMonday === thisMonday ? (
              <span className="tabular-nums">{rangeLabel(rangeStart, rangeEnd)}</span>
            ) : (
              <Link href="/plan" className="font-medium text-primary">Torna a oggi</Link>
            )}
            <Link href={`/plan?week=${addDays(firstMonday, 14)}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Settimane successive">
              <ChevronRight size={17} />
            </Link>
          </div>
        )}
      </div>

      {view === "weeks" ? (
        <>
          {[days.slice(0, 7), days.slice(7, 14)].map((week, index) => {
            const isCurrent = week[0].date === thisMonday;
            const isNext = week[0].date === addDays(thisMonday, 7);
            return (
              <PlanWeek
                key={week[0].date}
                days={week}
                today={today}
                highlight={isCurrent}
                title={isCurrent ? "Questa settimana" : isNext && index > 0 ? "Prossima settimana" : undefined}
              />
            );
          })}
        </>
      ) : (
        <div className="surface p-4">
          <PlanCalendar days={days} month={month} today={today} raceDate={goal?.race_date ?? null} />
        </div>
      )}

      <Button asChild variant="outline" className="mt-2 w-full">
        <Link href="/plan/new">
          <Plus size={16} /> Aggiungi una seduta
        </Link>
      </Button>
    </AppShell>
  );
}
