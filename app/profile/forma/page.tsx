import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeATLCTL } from "@/lib/metrics/load";
import { loadBodyTrends } from "@/lib/metrics/body-data";
import { addDays, romeDay } from "@/lib/local-date";
import { activeDuration } from "@/lib/format";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import type { Activity, Profile } from "@/lib/types";
import { FormaView } from "./forma-view";

type FormaActivity = Pick<
  Activity,
  "started_at" | "duration_s" | "moving_time_s" | "rpe" | "avg_hr" | "time_in_zone" | "sport" | "type" | "distance_m"
>;

/** Storico delle attività: 42 giorni di CTL prima dei 120 mostrati. */
const ACTIVITY_DAYS = 180;

export default async function FormaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = romeDay();
  const [{ data: profile }, { data: activities }] = await Promise.all([
    supabase.from("profiles").select("max_hr, resting_hr").eq("id", user.id).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
    supabase
      .from("activities")
      .select("started_at, duration_s, moving_time_s, rpe, avg_hr, time_in_zone, sport, type, distance_m")
      .eq("user_id", user.id)
      .is("excluded_at", null)
      .gte("started_at", `${addDays(today, -ACTIVITY_DAYS)}T00:00:00`)
      .order("started_at")
      .returns<FormaActivity[]>(),
  ]);
  const list = activities ?? [];
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, profile ?? null);
  const load = computeATLCTL(
    list.map((activity) => ({ ...activity, duration_s: activeDuration(activity) })),
    undefined,
    effectiveHr,
  );
  const trends = await loadBodyTrends(supabase, user.id, today, load.series, list);

  // Un punto a settimana, come nel profilo: linee leggibili.
  const recentLoad = load.series.slice(-85);
  const formPoints = recentLoad
    .filter((_, index) => (recentLoad.length - 1 - index) % 7 === 0)
    .map((point) => ({ date: point.date, form: point.ctl, fatigue: point.atl }));

  return <FormaView today={today} load={{ ...load, series: [] }} formPoints={formPoints} trends={trends} />;
}
