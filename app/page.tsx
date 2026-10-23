import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CoachChat } from "@/components/coach-chat";
import { TodayCard } from "@/components/home/today-card";
import { addDays, daysBetween, mondayOf, romeDay, romeHour } from "@/lib/local-date";
import { buildDays } from "@/lib/plan/day-status";
import { heatForDates } from "@/lib/weather";
import { getAiStatus } from "@/lib/ai/ai-status";
import type { Activity, CoachMessage, Goal, PlanProposal, PlannedWorkout } from "@/lib/types";

export const maxDuration = 240;

/** Saluto in base all'ora di adesso a Roma. */
function greeting(): string {
  const hour = romeHour(new Date().toISOString()) ?? 12;
  if (hour >= 5 && hour < 13) return "Buongiorno";
  if (hour >= 13 && hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/** "mercoledì 22 ottobre". */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export default async function Home({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = romeDay();
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const [goalRes, nextRes, weekPlanRes, weekActivitiesRes, messagesRes, proposalsRes, aiStatus, pendingEvaluationsRes] = await Promise.all([
    supabase.from("goals").select("race_name, race_date").eq("user_id", user.id).eq("is_active", true).maybeSingle<Pick<Goal, "race_name" | "race_date">>(),
    supabase.from("planned_workouts").select("*").eq("user_id", user.id).eq("status", "planned").gte("date", today).order("date").order("created_at").limit(1).maybeSingle<PlannedWorkout>(),
    supabase.from("planned_workouts").select("*").eq("user_id", user.id).gte("date", monday).lte("date", sunday).returns<PlannedWorkout[]>(),
    supabase.from("activities").select("started_at, sport, distance_m").eq("user_id", user.id).gte("started_at", `${addDays(monday, -1)}T12:00:00`).lte("started_at", `${addDays(sunday, 1)}T12:00:00`).returns<Array<Pick<Activity, "started_at" | "sport" | "distance_m">>>(),
    supabase.from("coach_messages").select("*").eq("user_id", user.id).in("kind", ["chat", "plan_proposal", "status"]).order("created_at", { ascending: false }).limit(60).returns<CoachMessage[]>(),
    supabase.from("plan_proposals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10).returns<PlanProposal[]>(),
    getAiStatus(supabase, user.id),
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending"),
  ]);

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const name = authName?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Runner";
  const next = nextRes.data;
  const goal = goalRes.data;
  const week = buildDays(monday, 7, today, weekPlanRes.data ?? [], weekActivitiesRes.data ?? []);
  const heat = next && next.type !== "cross" && daysBetween(today, next.date) <= 2
    ? (await heatForDates(supabase, user.id, [next.date])).get(next.date) ?? null
    : null;
  // Gara di oggi o appena passata (entro tre settimane): la scheda cambia.
  const race = goal?.race_date && goal.race_date <= today && daysBetween(goal.race_date, today) <= 21
    ? { name: goal.race_name, date: goal.race_date }
    : null;

  return (
    <AppShell fill>
      <div className="flex h-full min-h-0 flex-col">
        {/* Niente titolo grande: l'H1 della home è la prossima seduta. */}
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="eyebrow truncate">{greeting()}, {name}</p>
            <p className="mt-1 text-caption text-muted-foreground first-letter:uppercase">{longDate(today)}</p>
          </div>
          <Link
            href="/activities/new"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90"
            aria-label="Registra un'attività"
            title="Registra un'attività"
          >
            <Plus size={18} />
          </Link>
        </div>
        <div className="mb-3 shrink-0">
          <TodayCard next={next} today={today} heat={heat} week={week} race={race} />
        </div>
        <Suspense fallback={<div className="skeleton min-h-0 flex-1 rounded-3xl" />}>
          <CoachChat key={prompt ?? ""} messages={[...(messagesRes.data ?? [])].reverse()} proposals={proposalsRes.data ?? []} ai={aiStatus.chat} analyzingActivities={pendingEvaluationsRes.count ?? 0} />
        </Suspense>
      </div>
    </AppShell>
  );
}
