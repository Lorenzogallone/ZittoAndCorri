import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteActivity } from "../actions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import { timeInZoneFromSeries } from "@/lib/metrics/zones";
import { computeSplits } from "@/lib/metrics/splits";
import type { Activity, ActivityStream, Profile, TimeInZone } from "@/lib/types";
import { Clock, Gauge, Heart, HeartPulse, Mountain, Flame, Sparkles } from "lucide-react";
import { HrChart, PaceChart, ElevationChart } from "./activity-charts";

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
  easy: "bg-emerald-500/15 text-emerald-400",
  tempo: "bg-amber-500/15 text-amber-400",
  interval: "bg-red-500/15 text-red-400",
  long: "bg-blue-500/15 text-blue-400",
  race: "bg-primary/15 text-primary",
  recovery: "bg-teal-500/15 text-teal-400",
  cross: "bg-purple-500/15 text-purple-400",
};

const ZONE_LABELS: Record<string, string> = {
  z1: "Z1 · Recupero",
  z2: "Z2 · Fondo",
  z3: "Z3 · Medio",
  z4: "Z4 · Soglia",
  z5: "Z5 · VO₂max",
};

const ZONE_COLORS: Record<string, string> = {
  z1: "bg-sky-400",
  z2: "bg-emerald-400",
  z3: "bg-amber-400",
  z4: "bg-orange-400",
  z5: "bg-red-400",
};

/** Downsample a series to at most maxPoints by skipping evenly. */
function downsample<T>(arr: T[], maxPoints = 300): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ZoneBar({ zoneEntries }: { zoneEntries: [string, number][] }) {
  const maxZoneTime =
    zoneEntries.length > 0
      ? Math.max(...zoneEntries.map(([, s]) => s))
      : 0;

  return (
    <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
      <h2 className="text-sm font-semibold mb-4">Zone HR</h2>
      <div className="flex flex-col gap-3">
        {zoneEntries.map(([zone, seconds]) => {
          const pct = maxZoneTime > 0 ? (seconds / maxZoneTime) * 100 : 0;
          return (
            <div key={zone} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {ZONE_LABELS[zone] ?? zone}
                </span>
                <span className="tabular-nums text-foreground">
                  {formatDuration(seconds)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    ZONE_COLORS[zone] ?? "bg-primary"
                  }`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: activity }, { data: streams }, { data: profile }] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*")
        .eq("id", id)
        .maybeSingle<Activity>(),
      supabase
        .from("activity_streams")
        .select("hr_series, gps_series")
        .eq("activity_id", id)
        .maybeSingle<Pick<ActivityStream, "hr_series" | "gps_series">>(),
      supabase
        .from("profiles")
        .select("max_hr, resting_hr")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
    ]);

  if (!activity) notFound();

  const dateLabel = new Date(activity.started_at).toLocaleString("it-IT", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const profileCtx = profile ?? { max_hr: null, resting_hr: 50 };

  // Zone HR: se abbiamo la serie reale la usiamo (più precisa), altrimenti quella salvata
  const computedZones: TimeInZone | null =
    streams?.hr_series && streams.hr_series.length >= 2
      ? timeInZoneFromSeries(streams.hr_series, profileCtx)
      : activity.time_in_zone;

  // Splits: se la corsa non li ha (es. importata prima di Fase 2) li calcoliamo dagli stream
  const computedSplits =
    activity.splits ??
    (streams?.gps_series && streams.gps_series.length >= 2
      ? computeSplits(streams.gps_series, streams.hr_series ?? undefined)
      : null);

  const zoneEntries = computedZones
    ? (Object.entries(computedZones) as [string, number][])
    : [];

  // Downsample per il client
  const hrChartData = streams?.hr_series
    ? downsample(streams.hr_series, 300)
    : null;
  const eleChartData =
    streams?.gps_series && streams.gps_series.some((p) => p.ele != null)
      ? downsample(streams.gps_series, 300)
      : null;

  return (
    <AppShell backHref="/activities" backLabel="Corse" hideTabBar>
      {/* Hero */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${
              TYPE_COLORS[activity.type] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {TYPE_LABELS[activity.type] ?? activity.type}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          {formatDistance(activity.distance_m)}
        </h1>
        <p className="text-muted-foreground text-sm capitalize">{dateLabel}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <StatCard icon={Clock} label="Durata" value={formatDuration(activity.duration_s)} />
        <StatCard icon={Gauge} label="Passo" value={formatPace(activity.avg_pace_s_km)} />
        {activity.avg_hr != null && (
          <StatCard icon={Heart} label="HR media" value={`${activity.avg_hr} bpm`} />
        )}
        {activity.max_hr != null && (
          <StatCard icon={HeartPulse} label="HR max" value={`${activity.max_hr} bpm`} />
        )}
        {activity.elevation_gain_m != null && (
          <StatCard icon={Mountain} label="Dislivello +" value={`${activity.elevation_gain_m} m`} />
        )}
        {activity.rpe != null && (
          <StatCard icon={Flame} label="RPE" value={`${activity.rpe}/10`} />
        )}
      </div>

      {/* HR nel tempo */}
      {hrChartData && hrChartData.length >= 2 && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
          <h2 className="text-sm font-semibold mb-4">Frequenza cardiaca</h2>
          <HrChart data={hrChartData} />
        </div>
      )}

      {/* Passo per km */}
      {computedSplits && computedSplits.length > 0 && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
          <h2 className="text-sm font-semibold mb-4">Passo per km</h2>
          <PaceChart splits={computedSplits} />
        </div>
      )}

      {/* Profilo altimetrico */}
      {eleChartData && eleChartData.length >= 2 && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
          <h2 className="text-sm font-semibold mb-4">Profilo altimetrico</h2>
          <ElevationChart data={eleChartData} />
        </div>
      )}

      {/* HR Zones */}
      {zoneEntries.length > 0 && <ZoneBar zoneEntries={zoneEntries} />}

      {/* Notes */}
      {activity.notes && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-4">
          <h2 className="text-sm font-semibold mb-2">Note</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {activity.notes}
          </p>
        </div>
      )}

      {/* AI Evaluation placeholder */}
      <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-primary">Coach AI</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          La valutazione AI di questa corsa arriverà nella Fase 4.
        </p>
      </div>

      {/* Delete */}
      <div className="separator my-4" />
      <form action={deleteActivity} className="flex justify-center">
        <input type="hidden" name="id" value={activity.id} />
        <Button type="submit" variant="destructive" size="sm">
          Elimina corsa
        </Button>
      </form>
    </AppShell>
  );
}
