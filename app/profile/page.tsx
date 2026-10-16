import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { ChevronRight, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { FormChart } from "@/components/charts/form-chart";
import { WeekBars } from "@/components/charts/week-bars";
import { Predictions } from "@/components/progress/predictions";
import { Records } from "@/components/progress/records";
import { PaceHistory } from "@/components/progress/pace-history";
import { TechInfoCard } from "@/app/settings/tech-info-card";
import { computeATLCTL } from "@/lib/metrics/load";
import { personalRecords } from "@/lib/metrics/best-efforts";
import { predictionReference } from "@/lib/metrics/race-prediction";
import { weeklyVolume } from "@/lib/plan/weekly";
import { addDays, daysBetween, mondayOf, romeDay } from "@/lib/local-date";
import { backfillDerived } from "@/lib/derived";
import { getZeppDashboard } from "@/lib/zepp/data";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import type { Goal, Activity, Profile, PlannedWorkout } from "@/lib/types";
import { formatDistance, formatDuration, activeDuration } from "@/lib/format";

type ProfileActivity = Pick<
  Activity,
  "id" | "started_at" | "duration_s" | "moving_time_s" | "rpe" | "avg_hr" | "time_in_zone" | "sport" | "distance_m" | "best_efforts" | "pace_check"
>;

const WEEKS_BACK = 11;

function formTrend(series: Array<{ date: string; ctl: number }>): string | null {
  if (series.length < 42) return null;
  const now = series[series.length - 1].ctl;
  const before = series[series.length - 29].ctl;
  if (before <= 0) return null;
  const change = (now - before) / before;
  if (change > 0.05) return "La forma è in crescita rispetto a un mese fa.";
  if (change < -0.05) return "La forma è in calo rispetto a un mese fa.";
  return "La forma è stabile rispetto a un mese fa.";
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = romeDay();
  const firstMonday = addDays(mondayOf(today), -WEEKS_BACK * 7);
  const lastSunday = addDays(mondayOf(today), 13);
  const [{ data: activeGoal }, { data: profile }, { data: activities }, { data: planned }] = await Promise.all([
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    supabase.from("profiles").select("max_hr, resting_hr").eq("id", user.id).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
    supabase
      .from("activities")
      .select("id, started_at, duration_s, moving_time_s, rpe, avg_hr, time_in_zone, sport, distance_m, best_efforts, pace_check")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .returns<ProfileActivity[]>(),
    supabase
      .from("planned_workouts")
      .select("date, type, status, target_distance_m, target_duration_s, target_pace_s_km, workout_steps")
      .eq("user_id", user.id)
      .gte("date", firstMonday)
      .lte("date", lastSunday)
      .returns<Array<Pick<PlannedWorkout, "date" | "type" | "status" | "target_distance_m" | "target_duration_s" | "target_pace_s_km" | "workout_steps">>>(),
  ]);

  const list = activities ?? [];
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);
  const load = computeATLCTL(
    list.map((activity) => ({
      started_at: activity.started_at,
      duration_s: activeDuration(activity),
      rpe: activity.rpe,
      avg_hr: activity.avg_hr,
      time_in_zone: activity.time_in_zone,
      sport: activity.sport,
    })),
    undefined,
    effectiveHr,
  );
  const zepp = await getZeppDashboard(supabase, user.id, load);

  // Le corse importate prima dei record vengono completate in background.
  if (list.some((activity) => activity.sport === "running" && activity.best_efforts == null)) {
    const userId = user.id;
    after(() => backfillDerived(createAdminClient(), userId));
  }

  const formPoints = load.series.slice(-84).map((point) => ({ date: point.date, form: point.ctl, fatigue: point.atl }));
  const weeks = weeklyVolume(list, planned ?? [], firstMonday, WEEKS_BACK + 2);
  const records = personalRecords(list);
  const reference = predictionReference(
    list
      .filter((activity) => daysBetween(romeDay(activity.started_at), today) <= 120)
      .map((activity) => ({ ...activity, active_s: activeDuration(activity) })),
  );
  const paceSessions = list
    .filter((activity) => activity.pace_check?.status)
    .slice(0, 5)
    .map((activity) => ({ id: activity.id, started_at: activity.started_at, check: activity.pace_check! }));

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const displayName = authName || user.email?.split("@")[0] || "Runner";
  const initials = displayName.split(" ").map((word: string) => word[0]).join("").toUpperCase().slice(0, 2);
  const daysToRace = activeGoal?.race_date ? daysBetween(today, activeGoal.race_date) : null;

  return (
    <AppShell
      title="Profilo"
      headerAction={
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/settings" aria-label="Apri impostazioni" title="Impostazioni">
            <Settings size={18} />
          </Link>
        </Button>
      }
    >
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">{initials}</div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{displayName}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Link href="/goals" className="mb-8 flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Obiettivo</p>
          {activeGoal ? (
            <p className="truncate text-sm font-semibold">
              {activeGoal.race_name}
              <span className="font-normal text-muted-foreground">
                {" · "}{formatDistance(activeGoal.distance_m)}
                {activeGoal.target_time_s ? ` in ${formatDuration(activeGoal.target_time_s)}` : ""}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold">Da impostare</p>
          )}
        </div>
        {daysToRace != null && daysToRace >= 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
            {daysToRace === 0 ? "Oggi" : daysToRace === 1 ? "Domani" : `${daysToRace} giorni`}
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
      </Link>

      <Section title="Stato di forma">
        <TechInfoCard load={load} hasData={list.length > 0 || zepp.latest != null} zepp={zepp} />
      </Section>

      {formPoints.length >= 14 && (
        <Section title="Forma e fatica">
          <FormChart points={formPoints} />
          <p className="mt-2 text-xs text-muted-foreground">
            {formTrend(load.series) ?? "Forma = allenamento accumulato nelle ultime 6 settimane; fatica = quello degli ultimi 7 giorni."}
          </p>
        </Section>
      )}

      {weeks.some((week) => week.done_m > 0 || week.planned_m > 0) && (
        <Section title="Km a settimana">
          <WeekBars weeks={weeks} current={mondayOf(today)} />
        </Section>
      )}

      {reference && (
        <Section title="Previsioni gara">
          <Predictions reference={reference} goal={activeGoal ?? null} />
        </Section>
      )}

      {records.length > 0 && (
        <Section title="Record personali">
          <Records records={records} />
        </Section>
      )}

      {paceSessions.length > 0 && (
        <Section title="Passo nelle sedute veloci">
          <PaceHistory sessions={paceSessions} />
        </Section>
      )}
    </AppShell>
  );
}
