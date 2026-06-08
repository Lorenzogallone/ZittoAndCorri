import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PlanCalendar } from "@/components/plan-calendar";
import { computeAdherence } from "@/lib/metrics/adherence";
import { formatDistance } from "@/lib/format";
import { PlanGenerator } from "@/components/plan-generator";
import type { PlannedWorkout, Goal, Activity, PlanReview } from "@/lib/types";

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

  // Fetch parallelo: workout mese + goal attivo + workout ultimi 14gg per aderenza
  const fourteenAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: monthWorkouts },
    { data: activeGoal },
    { data: recentWorkouts },
    { data: monthActivities },
    { data: latestReview },
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
        .from("planned_workouts")
        .select("status, date")
        .eq("user_id", user.id)
        .gte("date", fourteenAgo)
        .lte("date", today)
        .returns<Array<{ status: string; date: string }>>(),
      supabase
        .from("activities")
        .select("id, started_at, type")
        .eq("user_id", user.id)
        .gte("started_at", `${start}T00:00:00`)
        .lte("started_at", `${end}T23:59:59`)
        .returns<Pick<Activity, "id" | "started_at" | "type">[]>(),
      supabase
        .from("plan_reviews")
        .select("summary, comments, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<PlanReview, "summary" | "comments" | "created_at">>(),
    ]);

  const adherence =
    recentWorkouts && recentWorkouts.length > 0
      ? computeAdherence(
          recentWorkouts as Parameters<typeof computeAdherence>[0],
          today,
        )
      : null;

  const weeksLeft = activeGoal?.race_date
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeGoal.race_date).getTime() - Date.now()) /
            (7 * 24 * 3600 * 1000),
        ),
      )
    : null;

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
        adherence={adherence}
      />

      {/* 3. Card coach AI (transizione tra calendario e review) */}
      <div className="mt-4">
        <PlanGenerator />
      </div>

      {/* 4. Ultima review del coach */}
      {latestReview?.summary && (
        <div className="mt-4 rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Review del coach</h2>
            <span className="text-xs text-muted-foreground">
              {new Date(latestReview.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {latestReview.summary}
          </p>
          {latestReview.comments && (
            <p className="text-xs text-muted-foreground mt-3 border-t border-border/40 pt-2">
              I tuoi vincoli: {latestReview.comments}
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}
