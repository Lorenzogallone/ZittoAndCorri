import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace, activeDuration } from "@/lib/format";
import { nowMs } from "@/lib/dates";
import type { Activity } from "@/lib/types";
import { Plus, Activity as ActivityIcon, Heart, Mountain } from "lucide-react";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  SPORT_LABELS,
  SPORT_COLORS,
  SPORT_ICONS,
} from "@/lib/activity-meta";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: activities }, { data: pendingEvaluationJobs }] = await Promise.all([
    supabase
      .from("activities")
      .select(
        "id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr, elevation_gain_m, rpe",
      )
      .order("started_at", { ascending: false })
      .returns<
        Pick<
          Activity,
          | "id"
          | "started_at"
          | "type"
          | "sport"
          | "distance_m"
          | "duration_s"
          | "moving_time_s"
          | "avg_pace_s_km"
          | "avg_hr"
          | "elevation_gain_m"
          | "rpe"
        >[]
      >(),
    supabase.from("ai_jobs").select("ref_id").eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending").returns<Array<{ ref_id: string | null }>>(),
  ]);

  const list = activities ?? [];
  const pendingActivityIds = new Set((pendingEvaluationJobs ?? []).flatMap((job) => job.ref_id ? [job.ref_id] : []));

  // Compute 30-day stats and trends — solo corsa: gli altri sport non
  // contano nel volume km.
  const now = nowMs();
  const thirtyDaysAgoMs = now - 30 * 24 * 3600 * 1000;
  const sixtyDaysAgoMs = now - 60 * 24 * 3600 * 1000;

  const runsOnly = list.filter((a) => a.sport === "running");
  const last30DaysRuns = runsOnly.filter(
    (a) => new Date(a.started_at).getTime() >= thirtyDaysAgoMs
  );
  const prev30DaysRuns = runsOnly.filter((a) => {
    const time = new Date(a.started_at).getTime();
    return time >= sixtyDaysAgoMs && time < thirtyDaysAgoMs;
  });

  const dist30 = last30DaysRuns.reduce((sum, a) => sum + a.distance_m, 0);
  const time30 = last30DaysRuns.reduce((sum, a) => sum + activeDuration(a), 0);
  const count30 = last30DaysRuns.length;

  const distPrev30 = prev30DaysRuns.reduce((sum, a) => sum + a.distance_m, 0);
  const diffKm = (dist30 - distPrev30) / 1000;
  const isPositiveTrend = diffKm >= 0;

  return (
    <AppShell
      title="Le mie attività"
      headerAction={
        <Button asChild size="sm">
          <Link href="/activities/new">
            <Plus size={16} />
            Nuova
          </Link>
        </Button>
      }
    >
      {/* 30 Days Stats & Trend Card */}
      {list.length > 0 && (
        <div className="mb-6 rounded-2xl bg-card border border-border p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
          
          <div className="relative">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
              Ultimi 30 Giorni
            </h2>

            <div className="grid grid-cols-3 gap-2 text-center py-2.5 bg-muted/20 rounded-xl border border-border/30 mb-3">
              <div>
                <p className="text-[10px] text-muted-foreground">Distanza</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {formatDistance(dist30)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Corse</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {count30}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Tempo</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {formatDuration(time30)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                isPositiveTrend 
                  ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}>
                {isPositiveTrend ? "▲ Volume in crescita" : "▼ Volume in calo"}
              </span>
              <span className="text-muted-foreground font-medium">
                {isPositiveTrend 
                  ? `+${diffKm.toFixed(1)} km rispetto ai 30gg prima`
                  : `${diffKm.toFixed(1)} km rispetto ai 30gg prima`
                }
              </span>
            </div>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <ActivityIcon size={28} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Nessuna attività</p>
            <p className="text-muted-foreground text-sm">
              Inizia a tracciare i tuoi allenamenti.
            </p>
          </div>
          <Button asChild>
            <Link href="/activities/new">
              <Plus size={16} />
              Nuova attività
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => {
            const isRun = (a.sport ?? "running") === "running";
            const SportIcon = SPORT_ICONS[a.sport ?? "other"];
            return (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="block rounded-2xl bg-card border border-border p-4 transition-all duration-200 active:scale-[0.98] hover:bg-muted/10 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isRun ? (
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${
                          TYPE_COLORS[a.type] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TYPE_LABELS[a.type] ?? a.type}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
                          SPORT_COLORS[a.sport ?? "other"]
                        }`}
                      >
                        <SportIcon size={12} />
                        {SPORT_LABELS[a.sport ?? "other"]}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-medium">
                      {formatDate(a.started_at)}
                    </span>
                    {pendingActivityIds.has(a.id) && (
                      <span className="inline-flex items-center rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Analisi AI…</span>
                    )}
                  </div>
                  <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {a.distance_m > 0
                      ? formatDistance(a.distance_m)
                      : formatDuration(activeDuration(a))}
                  </span>
                  
                  {/* Rich parameters */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                    {a.avg_hr && (
                      <span className="flex items-center gap-0.5">
                        <Heart size={11} className="text-red-500/80 fill-red-500/20" /> {a.avg_hr} bpm
                      </span>
                    )}
                    {a.avg_hr && a.elevation_gain_m && <span className="opacity-30">·</span>}
                    {a.elevation_gain_m && (
                      <span className="flex items-center gap-0.5">
                        <Mountain size={11} className="text-foreground/60" /> +{a.elevation_gain_m}m
                      </span>
                    )}
                    {(a.avg_hr || a.elevation_gain_m) && a.rpe && <span className="opacity-30">·</span>}
                    {a.rpe && (
                      <span className="flex items-center gap-0.5 font-medium">
                        RPE {a.rpe}/10
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="text-right text-sm text-muted-foreground tabular-nums shrink-0 self-center flex items-center gap-2">
                  <div>
                    <div className="font-semibold text-foreground/90">{formatDuration(activeDuration(a))}</div>
                    {/* Il passo min/km ha senso solo per la corsa. */}
                    {isRun && a.avg_pace_s_km != null && (
                      <div className="text-xs font-medium">{formatPace(a.avg_pace_s_km)}</div>
                    )}
                  </div>
                  <span className="text-muted-foreground/30 group-hover:text-foreground/70 transition-colors text-lg font-medium pr-1 pl-1">›</span>
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
