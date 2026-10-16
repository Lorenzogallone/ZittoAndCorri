// Immagine da condividere di un'attività. Solo per il proprietario.

import { createClient } from "@/lib/supabase/server";
import { shareImage, type ShareActivity } from "@/lib/share-image";
import type { GpsPoint } from "@/lib/types";

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
      .maybeSingle<ShareActivity>(),
    supabase.from("activity_streams").select("gps_series").eq("activity_id", id).maybeSingle<{ gps_series: GpsPoint[] | null }>(),
  ]);
  if (!activity) return new Response("Non trovata", { status: 404 });
  return shareImage(activity, stream?.gps_series ?? null);
}
