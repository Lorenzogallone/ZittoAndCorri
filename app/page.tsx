import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Flag, Footprints } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CoachChat } from "@/components/coach-chat";
import { todayIso, isoDaysFromNow } from "@/lib/dates";
import { formatDistance, formatPlannedDistance } from "@/lib/format";
import { TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity, CoachMessage, Goal, PlanProposal, PlannedWorkout } from "@/lib/types";

export const maxDuration = 60;

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayIso();
  const weekStart = isoDaysFromNow(-6);
  const [goalRes, nextRes, activitiesRes, messagesRes, proposalsRes, credentialRes, pendingEvaluationsRes] = await Promise.all([
    supabase.from("goals").select("race_name, race_date, distance_m").eq("user_id", user.id).eq("is_active", true).maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m">>(),
    supabase.from("planned_workouts").select("id, date, type, target_distance_m").eq("user_id", user.id).eq("status", "planned").gte("date", today).order("date").limit(1).maybeSingle<Pick<PlannedWorkout, "id" | "date" | "type" | "target_distance_m">>(),
    supabase.from("activities").select("sport, distance_m").eq("user_id", user.id).gte("started_at", `${weekStart}T00:00:00`).returns<Array<Pick<Activity, "sport" | "distance_m">>>(),
    supabase.from("coach_messages").select("*").eq("user_id", user.id).in("kind", ["chat", "plan_proposal"]).order("created_at", { ascending: false }).limit(60).returns<CoachMessage[]>(),
    supabase.from("plan_proposals").select("id, user_id, source_message_id, summary, range_start, range_end, workouts, status, created_at, applied_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10).returns<PlanProposal[]>(),
    supabase.from("user_ai_credentials").select("user_id").eq("user_id", user.id).maybeSingle<{ user_id: string }>(),
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending"),
  ]);

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const name = authName?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Runner";
  const weeklyKm = (activitiesRes.data ?? []).filter((item) => item.sport === "running").reduce((sum, item) => sum + item.distance_m, 0);
  const next = nextRes.data;
  const goal = goalRes.data;

  return (
    <AppShell>
      <div className="mb-5 flex items-end justify-between">
        <div><p className="text-sm text-muted-foreground">Bentornato</p><h1 className="text-3xl font-bold tracking-tight">Ciao {name}</h1></div>
        <Link href="/activities/new" className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">+ Attività</Link>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link href="/plan" className="col-span-2 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={19} /></div>
          <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prossimo allenamento</p><p className="mt-1 truncate text-sm font-semibold">{next ? TYPE_LABELS[next.type] : "Riposo"}</p><p className="mt-0.5 text-xs text-muted-foreground">{next ? `${next.date}${formatPlannedDistance(next) ? ` · ${formatPlannedDistance(next)}` : ""}` : "Nessuna seduta in programma"}</p></div>
          <span className="text-muted-foreground/50">›</span>
        </Link>
        <Link href="/activities" className="rounded-2xl border border-border bg-card p-4"><Footprints size={18} className="mb-3 text-primary" /><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ultimi 7 giorni</p><p className="mt-1 text-base font-semibold">{formatDistance(weeklyKm)}</p><p className="mt-0.5 text-xs text-muted-foreground">di corsa</p></Link>
        <Link href="/goals" className="rounded-2xl border border-border bg-card p-4"><Flag size={18} className="mb-3 text-primary" /><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Obiettivo</p><p className="mt-1 truncate text-base font-semibold">{goal?.race_name ?? "Da impostare"}</p><p className="mt-0.5 text-xs text-muted-foreground">{goal ? formatDistance(goal.distance_m) : "Parlane al coach"}</p></Link>
      </div>
      <Suspense fallback={<div className="h-[54svh] animate-pulse rounded-[1.75rem] bg-muted" />}>
        <CoachChat messages={[...(messagesRes.data ?? [])].reverse()} proposals={proposalsRes.data ?? []} keyConfigured={Boolean(credentialRes.data)} analyzingActivities={pendingEvaluationsRes.count ?? 0} />
      </Suspense>
    </AppShell>
  );
}
