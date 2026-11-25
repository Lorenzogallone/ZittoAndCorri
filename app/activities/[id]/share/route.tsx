// Shareable image of an activity. Owner only.

import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import { shareImage, type ShareActivity } from "@/lib/share-image";
import type { GpsPoint } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("activities.share");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(t("unauthenticated"), { status: 401 });

  const [{ data: activity }, { data: stream }] = await Promise.all([
    supabase
      .from("activities")
      .select("started_at, sport, type, distance_m, duration_s, moving_time_s, avg_pace_s_km, elevation_gain_m, source_title")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<ShareActivity>(),
    supabase.from("activity_streams").select("gps_series").eq("activity_id", id).maybeSingle<{ gps_series: GpsPoint[] | null }>(),
  ]);
  if (!activity) return new Response(t("notFound"), { status: 404 });
  return shareImage(activity, stream?.gps_series ?? null, await getTranslations("labels"), (await getLocale()) as Locale);
}
