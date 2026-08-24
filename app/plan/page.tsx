import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PlanCalendar } from "@/components/plan-calendar";
import { formatDistance, daysUntil } from "@/lib/format";
import type { PlannedWorkout, Goal, Activity } from "@/lib/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMonth(raw: string | undefined): string {
  if (!raw) return todayISO().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return todayISO().slice(0, 7);
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
  return { start, end };
}

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function PlanPage({ searchParams }: Props) {
  const { month: rawMonth } = await searchParams;
  const month = parseMonth(rawMonth);
  const today = todayISO();
  const { start, end } = monthBounds(month);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: monthWorkouts },
    { data: activeGoal },
    { data: monthActivities },
  ] = await Promise.all([
      supabase
        .from("planned_workouts")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", start)
        .lte("date", end)
        .order("date")
        .returns<PlannedWorkout[]>(),
      supabase
        .from("goals")
        .select("race_name, race_date, distance_m")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m">>(),
      supabase
        .from("activities")
        .select("id, started_at, type, sport")
        .eq("user_id", user.id)
        .gte("started_at", `${start}T00:00:00`)
        .lte("started_at", `${end}T23:59:59`)
        .returns<Pick<Activity, "id" | "started_at" | "type" | "sport">[]>(),
    ]);

  const daysToRace = daysUntil(activeGoal?.race_date);
  const weeksLeft = daysToRace != null ? Math.ceil(daysToRace / 7) : null;

  return (
    <AppShell title="Piano">
      {/* 1. Countdown all'obiettivo */}
      {activeGoal && (
        <Link href="/goals" className="block mb-4">
          <div className="relative overflow-hidden rounded-2xl bg-card border border-primary/20 glow-coral-sm p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-primary font-medium uppercase tracking-wider mb-1">
                  Obiettivo
                </p>
                <p className="font-semibold">{activeGoal.race_name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {activeGoal.distance_m ? formatDistance(activeGoal.distance_m) : ""}
                  {activeGoal.race_date &&
                    ` · ${new Date(activeGoal.race_date).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`}
                </p>
              </div>
              {weeksLeft !== null && (
                <div className="text-right shrink-0 ml-4">
                  <p className="text-3xl font-bold tabular-nums text-primary">
                    {weeksLeft}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {weeksLeft === 1 ? "settimana" : "settimane"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Link>
      )}

      {/* 2. Calendario */}
      <PlanCalendar
        workouts={monthWorkouts ?? []}
        activities={monthActivities ?? []}
        goal={activeGoal ?? null}
        month={month}
        today={today}
      />
    </AppShell>
  );
}
