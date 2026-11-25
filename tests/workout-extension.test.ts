import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WorkoutStepsInputSchema,
  legacyWorkoutStep,
  normalizeWorkoutSteps,
} from "../lib/workout-steps.ts";
import { ZeppPairRequestSchema, ZeppWorkoutPullRequestSchema } from "../lib/zepp/schema.ts";
import { selectWorkoutForDate } from "../lib/zepp/workout-selection.ts";

const workout = {
  id: "workout-1",
  steps: [
    {
      id: "step-1", order: 0, kind: "warmup", label: "Riscaldamento",
      completion_type: "time", completion_value: 60,
      pace_min_s_km: 330, pace_max_s_km: 390, hr_min_bpm: null, hr_max_bpm: 150,
    },
    {
      id: "step-2", order: 1, kind: "work", label: "1 km forte",
      completion_type: "distance", completion_value: 1000,
      pace_min_s_km: 270, pace_max_s_km: 300, hr_min_bpm: null, hr_max_bpm: 175,
    },
  ],
};

test("the schema accepts complete phases and rejects inconsistent conclusions", () => {
  const valid = workout.steps.map((step) => ({
    kind: step.kind,
    label: step.label,
    completion_type: step.completion_type,
    completion_value: step.completion_value,
    pace_min_s_km: step.pace_min_s_km,
    pace_max_s_km: step.pace_max_s_km,
    hr_min_bpm: step.hr_min_bpm,
    hr_max_bpm: step.hr_max_bpm,
  }));
  assert.equal(WorkoutStepsInputSchema.safeParse(valid).success, true);
  assert.equal(WorkoutStepsInputSchema.safeParse([{ ...valid[0], completion_value: null }]).success, false);
  assert.equal(WorkoutStepsInputSchema.safeParse([{ ...valid[0], pace_min_s_km: 500, pace_max_s_km: 400 }]).success, false);
  assert.deepEqual(normalizeWorkoutSteps(valid).map((step) => [step.id, step.order]), [["step-1", 0], ["step-2", 1]]);
});

test("a legacy workout is converted into a guided phase", () => {
  const [step] = legacyWorkoutStep({
    type: "easy",
    target_distance_m: 5000,
    target_duration_s: 1800,
    target_pace_s_km: 360,
    target_hr_bpm: 155,
  });
  assert.equal(step.completion_type, "distance");
  assert.equal(step.completion_value, 5000);
  assert.deepEqual([step.pace_min_s_km, step.pace_max_s_km], [350, 370]);
  assert.equal(step.hr_max_bpm, 155);
});

test("pairing distinguishes health and workout; the read-only plan serves both", () => {
  assert.equal(ZeppPairRequestSchema.parse({ code: "123456", clientId: "watch-health", device: {} }).clientKind, "health");
  assert.equal(ZeppPairRequestSchema.parse({ code: "123456", clientId: "watch-workout", clientKind: "workout", device: {} }).clientKind, "workout");
  assert.equal(ZeppWorkoutPullRequestSchema.safeParse({ localDate: "2026-08-26", timezoneOffsetMinutes: 120 }).success, true);

  const data = readFileSync(new URL("../lib/zepp/data.ts", import.meta.url), "utf8");
  const healthRoute = readFileSync(new URL("../app/api/zepp/sync/route.ts", import.meta.url), "utf8");
  const workoutRoute = readFileSync(new URL("../app/api/zepp/workouts/pull/route.ts", import.meta.url), "utf8");
  assert.match(data, /onConflict: "user_id,client_kind"/);
  assert.match(data, /\.eq\("user_id", userId\)\.eq\("client_kind", clientKind\)/);
  assert.match(healthRoute, /authorizeZeppToken\(token, "health"\)/);
  // The pull is read-only: used by the "Oggi" widget of the health Mini App.
  assert.match(workoutRoute, /authorizeZeppToken\(token\)/);
  assert.doesNotMatch(healthRoute, /authorizeZeppToken\(token\)/);
});

test("the pull prefers a valid override and requires a single workout today", () => {
  const rows = [
    { id: "a", date: "2026-08-26" },
    { id: "b", date: "2026-08-27" },
  ];
  assert.deepEqual(selectWorkoutForDate(rows, "2026-08-26", null), {
    selected: rows[0], source: "today", overrideValid: true,
  });
  assert.deepEqual(selectWorkoutForDate(rows, "2026-08-26", "b"), {
    selected: rows[1], source: "override", overrideValid: true,
  });
  assert.deepEqual(selectWorkoutForDate([...rows, { id: "c", date: "2026-08-26" }], "2026-08-26", null), {
    selected: null, source: "ambiguous", overrideValid: true,
  });
  assert.deepEqual(selectWorkoutForDate(rows, "2026-08-26", "missing"), {
    selected: rows[0], source: "today", overrideValid: false,
  });
});

test("the AI pipeline produces the guided phases", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0016_zepp_workout_extension.sql", import.meta.url), "utf8");
  assert.ok((prompt.match(/workout_steps/g) ?? []).length >= 5);
  assert.match(prompt, /ogni singola ripetuta/);
  assert.match(migration, /jsonb_build_array/);
});
