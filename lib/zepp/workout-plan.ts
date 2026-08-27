import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlannedWorkout, WorkoutStep } from "@/lib/types";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import type { ConnectionRow } from "@/lib/zepp/data";
import type { ZeppWorkoutPullRequest } from "@/lib/zepp/schema";
import { selectWorkoutForDate } from "@/lib/zepp/workout-selection";

export interface ZeppWorkoutWire {
  id: string;
  date: string;
  type: string;
  title: string;
  target_distance_m: number | null;
  target_duration_s: number | null;
  target_pace_s_km: number | null;
  target_hr_bpm: number | null;
  description: string | null;
  focus: string | null;
  updated_at: string;
  steps: WorkoutStep[];
}

interface WorkoutRow extends Omit<PlannedWorkout, "workout_steps"> {
  workout_steps: unknown;
}

const TYPE_TITLES: Record<string, string> = {
  easy: "Corsa facile",
  tempo: "Tempo run",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross training",
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function wireWorkout(row: WorkoutRow): ZeppWorkoutWire {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    title: TYPE_TITLES[row.type] ?? "Allenamento",
    target_distance_m: row.target_distance_m,
    target_duration_s: row.target_duration_s,
    target_pace_s_km: row.target_pace_s_km,
    target_hr_bpm: row.target_hr_bpm,
    description: row.description,
    focus: row.focus,
    updated_at: row.updated_at,
    steps: workoutStepsOrLegacy(row.workout_steps, row),
  };
}

function revisionFor(workouts: ZeppWorkoutWire[], overrideWorkoutId: string | null): string {
  return createHash("sha256")
    .update(JSON.stringify({ workouts, overrideWorkoutId }))
    .digest("hex")
    .slice(0, 32);
}

export async function pullZeppWorkoutPlan(
  connection: ConnectionRow,
  input: ZeppWorkoutPullRequest,
) {
  const admin = createAdminClient();
  const until = addDays(input.localDate, 13);
  const { data, error } = await admin
    .from("planned_workouts")
    .select("id, user_id, goal_id, date, type, target_distance_m, target_pace_s_km, target_duration_s, target_hr_bpm, workout_steps, description, focus, status, created_at, updated_at, origin")
    .eq("user_id", connection.user_id)
    .eq("status", "planned")
    .gte("date", input.localDate)
    .lte("date", until)
    .order("date")
    .order("created_at")
    .returns<WorkoutRow[]>();
  if (error) throw error;

  const workouts = (data ?? []).map(wireWorkout);
  const selection = selectWorkoutForDate(workouts, input.localDate, input.overrideWorkoutId);
  const revision = revisionFor(workouts, selection.source === "override" ? selection.selected?.id ?? null : null);

  const now = new Date().toISOString();
  await admin.from("zepp_connections").update({
    last_sync_at: now,
    last_error: null,
    updated_at: now,
  }).eq("id", connection.id);

  return {
    schemaVersion: 1 as const,
    revision,
    notModified: input.knownRevision === revision,
    overrideValid: selection.overrideValid,
    selectedWorkoutId: selection.selected?.id ?? null,
    selectionSource: selection.source,
    workouts: input.knownRevision === revision ? [] : workouts,
    serverTime: now,
  };
}
