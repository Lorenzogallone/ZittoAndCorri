import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace, daysUntil } from "@/lib/format";
import { computeAdherence } from "@/lib/metrics/adherence";
import type { Activity, Goal, PlannedWorkout, Profile } from "@/lib/types";
import { Plus } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

const TYPE_COLORS: Record<string, string> = {
  easy: "bg-green-500/20 text-green-400",
  tempo: "bg-orange-500/20 text-orange-400",
  interval: "bg-red-500/20 text-red-400",
  long: "bg-violet-500/20 text-violet-400",
  race: "bg-yellow-500/20 text-yellow-400",
  recovery: "bg-blue-500/20 text-blue-400",
  cross: "bg-zinc-500/20 text-zinc-400",
};

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

  const today = new Date().toISOString().slice(0, 10);
  const fourteenAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: profile },
    { data: lastActivity },
    { data: activeGoal },
    { data: nextWorkouts },
    { data: recentPlanned },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "display_name">>(),
    supabase
      .from("activities")
      .select("id, started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<
        Pick<Activity, "id" | "started_at" | "type" | "distance_m" | "duration_s" | "avg_pace_s_km" | "avg_hr">
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
      .limit(3)
      .returns<Pick<PlannedWorkout, "id" | "date" | "type" | "target_distance_m" | "target_duration_s" | "description">[]>(),
    supabase
      .from("planned_workouts")
      .select("status, date")
      .eq("user_id", user.id)
      .gte("date", fourteenAgo)
      .lte("date", today)
      .returns<Array<{ status: string; date: string }>>(),
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
        <div className="w-12 h-12 rounded-full overflow-hidden border border-white/[0.08] bg-card flex items-center justify-center shrink-0">
          <img
            src="/logo.png"
            alt="Logo Zitto e Corri"
            className="w-10 h-10 object-contain"
          />
        </div>
      </div>

      {/* Goal attivo */}
      {activeGoal ? (
        <Link href="/goals" className="block mb-4">
          <div className="relative overflow-hidden rounded-2xl bg-card border border-primary/25 glow-coral-sm p-5">
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
          <div className="rounded-2xl bg-card border border-dashed border-white/[0.10] p-5 flex items-center justify-between">
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
        <div className="rounded-2xl bg-card border border-white/[0.06] px-5 py-3 mb-4 flex items-center justify-between">
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
                ? "text-green-400"
                : adherence.pct >= 50
                ? "text-yellow-400"
                : "text-red-400"
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
                <div className="flex items-center gap-3 rounded-xl bg-card border border-white/[0.06] px-4 py-3 transition-transform duration-200 active:scale-[0.98]">
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

      {/* Last Run Card */}
      {lastActivity ? (
        <Link href={`/activities/${lastActivity.id}`} className="block mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-card border border-white/[0.06] p-6 glow-coral-sm transition-transform duration-200 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent pointer-events-none" />
            <div className="relative">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Ultima corsa
              </p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-4xl font-bold tabular-nums tracking-tight">
                  {formatDistance(lastActivity.distance_m)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-primary font-medium">
                  {TYPE_LABELS[lastActivity.type] ?? lastActivity.type}
                </span>
                <span className="opacity-30">·</span>
                <span className="tabular-nums">{formatDuration(lastActivity.duration_s)}</span>
                <span className="opacity-30">·</span>
                <span className="tabular-nums">{formatPace(lastActivity.avg_pace_s_km)}</span>
                {lastActivity.avg_hr != null && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="tabular-nums">{lastActivity.avg_hr} bpm</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-6 mb-6 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            Nessuna corsa ancora registrata.
          </p>
          <Button asChild>
            <Link href="/activities/new">Registra la prima</Link>
          </Button>
        </div>
      )}

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
