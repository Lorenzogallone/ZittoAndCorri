// Immagine da condividere di un'attività (1080×1350, formato verticale dei
// social): percorso, distanza e numeri principali. Solo per il proprietario.

import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { activeDuration, formatDuration, formatPace } from "@/lib/format";
import { routeSvgPath } from "@/lib/route-path";
import { SPORT_LABELS, TYPE_LABELS } from "@/lib/activity-meta";
import type { Activity, GpsPoint } from "@/lib/types";

const WIDTH = 1080;
const HEIGHT = 1350;
const CORAL = "#e8765a";

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, index) => index % step === 0 || index === items.length - 1);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Non autenticato", { status: 401 });

  const [{ data: activity }, { data: stream }] = await Promise.all([
    supabase
      .from("activities")
      .select("started_at, sport, type, distance_m, duration_s, moving_time_s, avg_pace_s_km, elevation_gain_m, source_title")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<Pick<Activity, "started_at" | "sport" | "type" | "distance_m" | "duration_s" | "moving_time_s" | "avg_pace_s_km" | "elevation_gain_m" | "source_title">>(),
    supabase.from("activity_streams").select("gps_series").eq("activity_id", id).maybeSingle<{ gps_series: GpsPoint[] | null }>(),
  ]);
  if (!activity) return new Response("Non trovata", { status: 404 });

  const route = stream?.gps_series?.length ? routeSvgPath(downsample(stream.gps_series, 400), 920, 640, 40) : null;
  const isRun = activity.sport === "running";
  const headline = activity.distance_m > 0
    ? `${(activity.distance_m / 1000).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
    : formatDuration(activeDuration(activity));
  const stats = [
    { label: "Tempo", value: formatDuration(activeDuration(activity)) },
    isRun && activity.avg_pace_s_km ? { label: "Passo", value: formatPace(activity.avg_pace_s_km) } : null,
    activity.elevation_gain_m ? { label: "Dislivello", value: `${activity.elevation_gain_m} m` } : null,
  ].filter((stat): stat is { label: string; value: string } => stat != null);
  const title = activity.source_title || (isRun ? TYPE_LABELS[activity.type] : SPORT_LABELS[activity.sport]);
  const date = new Date(activity.started_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#16161f", color: "#f4f4f5", padding: 80 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, color: "#a1a1aa" }}>
          <span>{date}</span>
          <span style={{ color: CORAL, fontWeight: 700 }}>Zitto e Corri</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          {route ? (
            <svg width={920} height={640} viewBox="0 0 920 640">
              <path d={route} fill="none" stroke={CORAL} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div style={{ display: "flex", width: 220, height: 220, borderRadius: 110, background: "rgba(232,118,90,0.15)" }} />
          )}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#a1a1aa" }}>{title}</div>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05 }}>{headline}</div>
        <div style={{ display: "flex", marginTop: 40, gap: 72 }}>
          {stats.map((stat) => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 28, color: "#a1a1aa" }}>{stat.label}</span>
              <span style={{ fontSize: 56, fontWeight: 700 }}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, headers: { "Cache-Control": "private, max-age=300" } },
  );
}
