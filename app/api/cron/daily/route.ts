// Cron giornaliero: promemoria della seduta di domani (ora di Roma).
// Auth: Authorization: Bearer ${CRON_SECRET} (vedi vercel.json).

import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthError } from "@/lib/push/cron-auth";
import { isPushConfigured, sendPushToUser } from "@/lib/push/send";
import { reminderBody } from "@/lib/push/messages";
import { romeDate, shiftIsoDate } from "@/lib/push/weekly-stats";
import { TYPE_LABELS } from "@/lib/activity-meta";
import type { PlannedWorkout } from "@/lib/types";

export const maxDuration = 300;

type ReminderWorkout = Pick<
  PlannedWorkout,
  "id" | "user_id" | "type" | "target_distance_m" | "target_duration_s" | "target_pace_s_km" | "workout_steps"
>;

export async function GET(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;

  const date = shiftIsoDate(romeDate(), 1);
  if (!isPushConfigured()) return Response.json({ date, skipped: "push non configurato" });

  const admin = createAdminClient();
  const [subsRes, workoutsRes] = await Promise.all([
    admin.from("push_subscriptions").select("user_id").returns<Array<{ user_id: string }>>(),
    admin
      .from("planned_workouts")
      .select("id, user_id, type, target_distance_m, target_duration_s, target_pace_s_km, workout_steps")
      .eq("status", "planned")
      .eq("date", date)
      .order("created_at")
      .returns<ReminderWorkout[]>(),
  ]);
  const queryError = subsRes.error ?? workoutsRes.error;
  if (queryError) {
    console.error("cron daily:", queryError.message);
    return Response.json({ error: "Query non riuscita." }, { status: 500 });
  }

  const subscribed = new Set((subsRes.data ?? []).map((row) => row.user_id));
  const byUser = new Map<string, ReminderWorkout[]>();
  for (const workout of workoutsRes.data ?? []) {
    if (!subscribed.has(workout.user_id)) continue;
    byUser.set(workout.user_id, [...(byUser.get(workout.user_id) ?? []), workout]);
  }

  let notified = 0;
  let delivered = 0;
  for (const [userId, workouts] of byUser) {
    const [first] = workouts;
    const labels = [...new Set(workouts.map((w) => TYPE_LABELS[w.type]))].join(" + ");
    const sent = await sendPushToUser(userId, {
      title: `Domani: ${labels}`,
      body: reminderBody(first),
      url: workouts.length > 1 ? `/plan/day/${date}` : `/plan/${first.id}`,
      tag: `reminder-${date}`,
    });
    if (sent) notified += 1;
    delivered += sent;
  }

  return Response.json({ date, users: byUser.size, notified, delivered });
}
