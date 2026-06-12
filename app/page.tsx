import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace, daysUntil } from "@/lib/format";
import { todayIso, isoDaysFromNow } from "@/lib/dates";
import { computeAdherence } from "@/lib/metrics/adherence";
import type { Activity, Goal, PlannedWorkout, Profile } from "@/lib/types";
import { Plus } from "lucide-react";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  SPORT_LABELS,
  SPORT_COLORS,
  SPORT_ICONS,
} from "@/lib/activity-meta";

function formatShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const today = todayIso();
  const fourteenAgo = isoDaysFromNow(-14);
  const now = new Date();
  const day = now.getDay();
  // Get Monday of the current week (adjust when Sunday = 0)
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(now.setDate(diff));
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfWeekISO = startOfWeek.toISOString();

  const [
    { data: profile },
    { data: lastActivity },
    { data: activeGoal },
    { data: nextWorkouts },
    { data: recentPlanned },
    { data: thisWeekActivities },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "display_name">>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, avg_pace_s_km, avg_hr")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<
        Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "avg_pace_s_km" | "avg_hr">
      >(),
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    supabase
      .from("planned_workouts")
      .select("id, date, type, target_distance_m, target_duration_s, description")
      .eq("user_id", user.id)
      .eq("status", "planned")
      .gte("date", today)
      .order("date")
      .limit(2)
      .returns<Pick<PlannedWorkout, "id" | "date" | "type" | "target_distance_m" | "target_duration_s" | "description">[]>(),
    supabase
      .from("planned_workouts")
      .select("status, date")
      .eq("user_id", user.id)
      .gte("date", fourteenAgo)
      .lte("date", today)
      .returns<Array<{ status: string; date: string }>>(),
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, avg_pace_s_km, avg_hr")
      .eq("user_id", user.id)
      .gte("started_at", startOfWeekISO)
      .order("started_at", { ascending: true })
      .returns<Pick<Activity, "id" | "started_at" | "type" | "sport" | "distance_m" | "duration_s" | "avg_pace_s_km" | "avg_hr">[]>(),
  ]);

  const greeting = profile?.display_name
    ? profile.display_name.split(" ")[0]
    : user.email?.split("@")[0] ?? "Runner";

  const daysLeft = daysUntil(activeGoal?.race_date);

  const adherence =
    recentPlanned && recentPlanned.length > 0
      ? computeAdherence(
          recentPlanned as Parameters<typeof computeAdherence>[0],
          today,
        )
      : null;

  const weekActivities = thisWeekActivities ?? [];
  // Le statistiche settimanali (km, passo) sono solo di corsa: una sgambata
  // in bici non deve gonfiare il volume running.
  const weekRuns = weekActivities.filter((a) => a.sport === "running");
  const totalDistance = weekRuns.reduce((acc, curr) => acc + curr.distance_m, 0);
  const totalDuration = weekRuns.reduce((acc, curr) => acc + curr.duration_s, 0);
  const runCount = weekRuns.length;

  const weekdaysLabels = ["L", "M", "M", "G", "V", "S", "D"];
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      dateStr: d.toISOString().slice(0, 10),
      label: weekdaysLabels[i],
      activities: [] as typeof weekActivities,
    };
  });

  for (const act of weekActivities) {
    const actDate = new Date(act.started_at);
    const dayOfWeek = (actDate.getDay() + 6) % 7;
    weekDays[dayOfWeek].activities.push(act);
  }

  return (
    <AppShell>
      {/* Greeting */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Bentornato</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Ciao {greeting} 👋
          </h1>
        </div>
        <img
          src="/logo.png"
          alt="Logo Zitto e Corri"
          className="w-12 h-12 rounded-xl object-cover border border-border shrink-0 dark:invert dark:hue-rotate-180"
        />
      </div>

      {/* Goal attivo */}
      {activeGoal ? (
        <Link href="/goals" className="block mb-4">
          <div className="relative overflow-hidden rounded-2xl bg-card border border-primary/20 glow-coral-sm p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-primary font-medium uppercase tracking-wider mb-1">
                  Obiettivo attivo
                </p>
                <p className="font-semibold">{activeGoal.race_name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatDistance(activeGoal.distance_m)}
                  {activeGoal.target_time_s && ` · Target ${formatDuration(activeGoal.target_time_s)}`}
                  {activeGoal.race_date && ` · ${new Date(activeGoal.race_date).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`}
                </p>
              </div>
              {daysLeft !== null && (
                <div className="text-right shrink-0 ml-4">
                  <p className="text-3xl font-bold tabular-nums text-primary">{daysLeft}</p>
                  <p className="text-xs text-muted-foreground">
                    {daysLeft === 0 ? "Oggi!" : daysLeft === 1 ? "giorno" : "giorni"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <Link href="/goals/new" className="block mb-4">
          <div className="rounded-2xl bg-card border border-dashed border-border p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Nessun obiettivo impostato
              </p>
              <p className="text-sm font-medium">Imposta la tua prossima gara</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Es. Maratona di Roma — data e tempo target
              </p>
            </div>
            <span className="text-muted-foreground/40 text-xl ml-4">›</span>
          </div>
        </Link>
      )}

      {/* Aderenza 14gg */}
      {adherence && adherence.total > 0 && (
        <div className="rounded-2xl bg-card border border-border px-5 py-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
              Aderenza 14 gg
            </p>
            <p className="text-sm font-medium">
              {adherence.completed}/{adherence.total} completati
            </p>
          </div>
          <span
            className={`text-2xl font-bold tabular-nums ${
              adherence.pct >= 75
                ? "text-emerald-500"
                : adherence.pct >= 50
                ? "text-amber-500"
                : "text-red-500"
            }`}
          >
            {adherence.pct}%
          </span>
        </div>
      )}

      {/* Prossimi allenamenti */}
      {nextWorkouts && nextWorkouts.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Prossimi allenamenti
          </p>
          <div className="flex flex-col gap-2">
            {nextWorkouts.map((w) => (
              <Link key={w.id} href={`/plan/${w.id}`} className="block">
                <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3 transition-transform duration-200 active:scale-[0.98]">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      TYPE_COLORS[w.type] ?? "bg-zinc-500/20 text-zinc-400"
                    }`}
                  >
                    {TYPE_LABELS[w.type] ?? w.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {formatShortDate(w.date)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        w.target_distance_m && formatDistance(w.target_distance_m),
                        w.target_duration_s && formatDuration(w.target_duration_s),
                        w.description,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-muted-foreground/40 text-sm">›</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Riepilogo Settimanale & Focus Ultima Corsa */}
      <div className="mb-6 rounded-2xl bg-card border border-border p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
        
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Questa Settimana
            </h2>
            {runCount > 0 && (
              <span className="text-xs text-muted-foreground font-medium">
                {runCount} {runCount === 1 ? "corsa" : "corse"}
              </span>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 text-center py-2 bg-muted/30 rounded-xl mb-4 border border-border/30">
            <div>
              <p className="text-[10px] text-muted-foreground">Distanza</p>
              <p className="text-base font-bold tabular-nums text-foreground">
                {formatDistance(totalDistance)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Tempo</p>
              <p className="text-base font-bold tabular-nums text-foreground">
                {formatDuration(totalDuration)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Passo Medio</p>
              <p className="text-base font-bold tabular-nums text-foreground">
                {totalDistance > 0 ? formatPace(Math.round(totalDuration / (totalDistance / 1000))) : "-"}
              </p>
            </div>
          </div>

          {/* Weekday Visualizer */}
          <div className="flex justify-between items-center gap-1 mb-5">
            {weekDays.map((day, i) => {
              const hasActivity = day.activities.length > 0;
              // La corsa ha la precedenza come attivit\u00E0 "principale" del giorno;
              // altrimenti l'attivit\u00E0 pi\u00F9 lunga di altro sport.
              const dayRuns = day.activities.filter((a) => a.sport === "running");
              const pool = dayRuns.length > 0 ? dayRuns : day.activities;
              const mainActivity = pool.reduce(
                (prev, current) =>
                  prev && prev.duration_s > current.duration_s ? prev : current,
                pool[0],
              );
              const runDistOnDay = dayRuns.reduce((sum, a) => sum + a.distance_m, 0);
              const isRunDay = dayRuns.length > 0;
              const SportIcon = mainActivity
                ? SPORT_ICONS[mainActivity.sport ?? "other"]
                : null;

              return (
                <div key={i} className="flex flex-col items-center flex-1">
                  <span className="text-[10px] font-medium text-muted-foreground/60 mb-1.5">
                    {day.label}
                  </span>
                  {hasActivity ? (
                    <Link
                      href={`/activities/${mainActivity.id}`}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-transform active:scale-95 border border-transparent shadow-sm ${
                        (isRunDay
                          ? TYPE_COLORS[mainActivity.type]
                          : SPORT_COLORS[mainActivity.sport ?? "other"]) ??
                        "bg-muted text-muted-foreground"
                      }`}
                      title={
                        isRunDay
                          ? `${TYPE_LABELS[mainActivity.type] ?? mainActivity.type}: ${formatDistance(runDistOnDay)}`
                          : `${SPORT_LABELS[mainActivity.sport ?? "other"]}: ${formatDuration(mainActivity.duration_s)}`
                      }
                    >
                      {isRunDay || !SportIcon ? day.label : <SportIcon size={14} />}
                    </Link>
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-border/40 flex items-center justify-center text-[11px] text-muted-foreground/30 font-medium bg-muted/10">
                      {day.label}
                    </div>
                  )}
                  <span className="text-[9px] tabular-nums mt-1.5 font-semibold text-muted-foreground/80">
                    {isRunDay ? `${(runDistOnDay / 1000).toFixed(0)}k` : "\u00A0"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-border/40 my-4" />

          {/* Focus Ultima Corsa */}
          {lastActivity ? (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  {lastActivity.sport === "running" ? "Ultima Corsa" : "Ultima Attività"}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {formatShortDate(lastActivity.started_at.slice(0, 10))}
                </span>
              </div>
              <Link 
                href={`/activities/${lastActivity.id}`}
                className="block rounded-xl bg-card border border-border p-4 hover:bg-muted/10 transition-all duration-200 active:scale-[0.99] group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-bold tabular-nums tracking-tight">
                        {lastActivity.distance_m > 0
                          ? formatDistance(lastActivity.distance_m)
                          : formatDuration(lastActivity.duration_s)}
                      </span>
                      {lastActivity.sport === "running" ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          TYPE_COLORS[lastActivity.type] ?? "bg-zinc-500/20 text-zinc-400"
                        }`}>
                          {TYPE_LABELS[lastActivity.type] ?? lastActivity.type}
                        </span>
                      ) : (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          SPORT_COLORS[lastActivity.sport ?? "other"]
                        }`}>
                          {SPORT_LABELS[lastActivity.sport ?? "other"]}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="tabular-nums font-medium text-foreground/80">{formatDuration(lastActivity.duration_s)}</span>
                      {lastActivity.avg_pace_s_km != null && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="tabular-nums font-medium text-foreground/80">{formatPace(lastActivity.avg_pace_s_km)}</span>
                        </>
                      )}
                      {lastActivity.avg_hr != null && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="tabular-nums font-medium text-foreground/80">{lastActivity.avg_hr} bpm</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground/40 group-hover:text-foreground/70 transition-colors text-lg font-medium pr-1 pl-2">›</span>
                </div>
              </Link>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Nessuna corsa registrata.
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/activities/new">
            <Plus size={18} />
            Nuova corsa
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/activities">Le mie corse</Link>
        </Button>
      </div>
    </AppShell>
  );
}
