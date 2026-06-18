import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace, activeDuration, formatPlannedDistance } from "@/lib/format";
import type { PlannedWorkout, Activity, WorkoutType, Sport } from "@/lib/types";
import { Plus } from "lucide-react";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  SPORT_LABELS,
  SPORT_COLORS,
  SPORT_ICONS,
} from "@/lib/activity-meta";

function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return !Number.isNaN(new Date(d + "T00:00:00").getTime());
}

function formatLongDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function TypeBadge({ type }: { type: WorkoutType }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_COLORS[type] ?? "bg-zinc-500/20 text-zinc-400"
      }`}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function SportBadge({ sport }: { sport: Sport }) {
  const Icon = SPORT_ICONS[sport];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${SPORT_COLORS[sport]}`}
    >
      <Icon size={12} />
      {SPORT_LABELS[sport]}
    </span>
  );
}

interface Props {
  params: Promise<{ date: string }>;
}

export default async function DayViewPage({ params }: Props) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: planned }, { data: activities }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("created_at")
      .returns<PlannedWorkout[]>(),
    supabase
      .from("activities")
      .select(
        "id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, avg_hr",
      )
      .eq("user_id", user.id)
      .gte("started_at", `${date}T00:00:00`)
      .lte("started_at", `${date}T23:59:59`)
      .order("started_at")
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
        >[]
      >(),
  ]);

  const plannedWorkouts = planned ?? [];
  const dayActivities = activities ?? [];

  return (
    <AppShell title="Giorno" backHref="/plan" backLabel="Piano" hideTabBar>
      <p className="mb-5 text-lg font-semibold capitalize">
        {formatLongDate(date)}
      </p>

      {/* Pianificato */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pianificato
          </h2>
          <Link
            href="/plan/new"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={13} /> Aggiungi
          </Link>
        </div>

        {plannedWorkouts.length > 0 ? (
          <div className="flex flex-col gap-2">
            {plannedWorkouts.map((w) => (
              <Link key={w.id} href={`/plan/${w.id}`} className="block">
                <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3 transition-transform duration-200 active:scale-[0.98]">
                  <TypeBadge type={w.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {[
                        formatPlannedDistance(w),
                        w.target_pace_s_km && formatPace(w.target_pace_s_km),
                        w.target_duration_s && formatDuration(w.target_duration_s),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Allenamento"}
                    </p>
                    {w.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {w.description}
                      </p>
                    )}
                  </div>
                  {w.status === "completed" && (
                    <span className="text-xs text-emerald-500 font-medium">✓</span>
                  )}
                  <span className="text-sm text-muted-foreground/40">›</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Niente in programma.</p>
        )}
      </section>

      {/* Fatto */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fatto
          </h2>
          <Link
            href="/activities/new"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={13} /> Registra corsa
          </Link>
        </div>

        {dayActivities.length > 0 ? (
          <div className="flex flex-col gap-2">
            {dayActivities.map((a) => {
              const isRun = (a.sport ?? "running") === "running";
              return (
              <Link key={a.id} href={`/activities/${a.id}`} className="block">
                <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3 transition-transform duration-200 active:scale-[0.98]">
                  {isRun ? <TypeBadge type={a.type} /> : <SportBadge sport={a.sport ?? "other"} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tabular-nums">
                      {[
                        a.distance_m > 0 && formatDistance(a.distance_m),
                        formatDuration(activeDuration(a)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {[
                        a.avg_pace_s_km != null && formatPace(a.avg_pace_s_km),
                        a.avg_hr != null && `${a.avg_hr} bpm`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground/40">›</span>
                </div>
              </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessuna corsa registrata.</p>
        )}
      </section>

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href="/plan">← Torna al calendario</Link>
      </Button>
    </AppShell>
  );
}
