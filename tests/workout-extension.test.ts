import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ALERT_COOLDOWN_MS,
  createRuntime,
  kilometerProjection,
  moveStep,
  parseDuration,
  updateRuntime,
} from "../zepp-workout-extension/shared/engine.js";
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

test("lo schema accetta fasi complete e rifiuta conclusioni incoerenti", () => {
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

test("un allenamento legacy viene convertito in una fase guidata", () => {
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

test("la macchina a stati usa tempo e distanza netti e non avanza in pausa", () => {
  assert.equal(parseDuration("1:15:15"), 4515);
  const runtime = createRuntime(workout, { duration: 10, distance: 100 });
  const paused = updateRuntime(runtime, workout, { duration: 10, distance: 100, speed: 10, hr: 130 }, 10_000);
  assert.equal(runtime.stepIndex, 0);
  assert.equal(paused.remaining, 60);

  const transition = updateRuntime(runtime, workout, { duration: 70, distance: 260, speed: 10, hr: 140 }, 70_000);
  assert.deepEqual(transition.events, ["phase_transition"]);
  assert.equal(runtime.stepIndex, 1);
  assert.equal(runtime.stepStartDistance, 260);

  updateRuntime(runtime, workout, { duration: 370, distance: 1260, speed: 12, hr: 165 }, 370_000);
  assert.equal(runtime.complete, true);
});

test("avanzamento manuale rispetta i confini e può tornare alla fase precedente", () => {
  const runtime = createRuntime(workout, { duration: 0, distance: 0 });
  assert.equal(moveStep(runtime, workout, 1, { duration: 20, distance: 100 }), "phase_transition");
  assert.equal(runtime.stepIndex, 1);
  assert.equal(moveStep(runtime, workout, -1, { duration: 21, distance: 103 }), "phase_transition");
  assert.equal(runtime.stepIndex, 0);
});

test("al ritorno in primo piano riallinea più fasi usando le basi cumulative", () => {
  const runtime = createRuntime(workout, { duration: 0, distance: 0 });
  const result = updateRuntime(runtime, workout, { duration: 360, distance: 1500, speed: 12, hr: 160 }, 360_000);
  assert.deepEqual(result.events, ["phase_transition", "complete"]);
  assert.equal(runtime.complete, true);
  assert.ok(Math.abs(runtime.stepStartDuration - 300) < 0.001);
  assert.equal(runtime.stepStartDistance, 1250);
});

test("gli avvisi richiedono permanenza fuori target e cooldown", () => {
  const alertWorkout = { ...workout, steps: [{ ...workout.steps[0], completion_value: 500 }] };
  const runtime = createRuntime(alertWorkout, { duration: 0, distance: 0 });
  for (let second = 1; second <= 19; second += 1) {
    const result = updateRuntime(runtime, alertWorkout, { duration: second, distance: second * 4, speed: 15, hr: 140 }, second * 1000);
    assert.doesNotMatch(result.events.join(","), /pace_fast/);
  }
  assert.match(updateRuntime(runtime, alertWorkout, { duration: 21, distance: 84, speed: 15, hr: 140 }, 21_000).events.join(","), /pace_fast/);
  assert.doesNotMatch(updateRuntime(runtime, alertWorkout, { duration: 22, distance: 88, speed: 15, hr: 140 }, 22_000).events.join(","), /pace_fast/);
  assert.match(updateRuntime(runtime, alertWorkout, { duration: 21 + ALERT_COOLDOWN_MS / 1000, distance: 324, speed: 15, hr: 140 }, 21_000 + ALERT_COOLDOWN_MS).events.join(","), /pace_fast/);

  const hrWorkout = { ...workout, steps: [{ ...workout.steps[0], completion_value: 500, hr_max_bpm: 130 }] };
  const hrRuntime = createRuntime(hrWorkout, { duration: 0, distance: 0 });
  updateRuntime(hrRuntime, hrWorkout, { duration: 1, distance: 2, speed: null, hr: 150 }, 1_000);
  assert.match(updateRuntime(hrRuntime, hrWorkout, { duration: 31, distance: 62, speed: null, hr: 150 }, 31_000).events.join(","), /hr_high/);
});

test("la previsione chilometrica interpola il passaggio e usa la media mobile", () => {
  const longWorkout = { ...workout, steps: [{ ...workout.steps[1], completion_value: 5000 }] };
  const runtime = createRuntime(longWorkout, { duration: 0, distance: 0 });
  updateRuntime(runtime, longWorkout, { duration: 290, distance: 990, speed: 12, hr: 150 }, 290_000);
  const result = updateRuntime(runtime, longWorkout, { duration: 300, distance: 1010, speed: 12, hr: 150 }, 300_000);
  assert.ok(Math.abs((runtime.kmBoundaries as Record<number, number>)[1] - 295) < 0.001);
  assert.equal(result.projection?.kilometer, 2);
  assert.ok(Math.abs((result.projection?.projectedSeconds ?? 0) - 302) < 0.001);
  assert.equal(kilometerProjection({ ...runtime, kmBoundaries: {} }, { duration: 300, distance: 1010 }, 300), null);
});

test("pairing e pull distinguono rigidamente health e workout", () => {
  assert.equal(ZeppPairRequestSchema.parse({ code: "123456", clientId: "watch-health", device: {} }).clientKind, "health");
  assert.equal(ZeppPairRequestSchema.parse({ code: "123456", clientId: "watch-workout", clientKind: "workout", device: {} }).clientKind, "workout");
  assert.equal(ZeppWorkoutPullRequestSchema.safeParse({ localDate: "2026-08-26", timezoneOffsetMinutes: 120 }).success, true);

  const data = readFileSync(new URL("../lib/zepp/data.ts", import.meta.url), "utf8");
  const healthRoute = readFileSync(new URL("../app/api/zepp/sync/route.ts", import.meta.url), "utf8");
  const workoutRoute = readFileSync(new URL("../app/api/zepp/workouts/pull/route.ts", import.meta.url), "utf8");
  assert.match(data, /onConflict: "user_id,client_kind"/);
  assert.match(data, /\.eq\("user_id", userId\)\.eq\("client_kind", clientKind\)/);
  assert.match(healthRoute, /authorizeZeppToken\(token, "health"\)/);
  assert.match(workoutRoute, /authorizeZeppToken\(token, "workout"\)/);
});

test("il pull preferisce un override valido e richiede un solo allenamento oggi", () => {
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

test("pipeline AI, cache offline e controlli dell'estensione restano nel contratto", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0016_zepp_workout_extension.sql", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../zepp-workout-extension/shared/sync.js", import.meta.url), "utf8");
  const widget = readFileSync(new URL("../zepp-workout-extension/data-widget/common/index.js", import.meta.url), "utf8");
  assert.ok((prompt.match(/workout_steps/g) ?? []).length >= 5);
  assert.match(prompt, /ogni singola ripetuta/);
  assert.match(migration, /jsonb_build_array/);
  assert.match(sync, /result\.notModified && cached/);
  assert.match(widget, /Offline · uso piano salvato/);
  assert.match(widget, /KEY_EVENT_DOUBLE_CLICK/);
  assert.match(widget, /event\.CLICK/);
  assert.match(widget, /radius: px\(233\)/);
  assert.match(widget, /RESIDUO FASE/);
  assert.match(widget, /DISTANZA KM/);
  assert.match(widget, /TEMPO NETTO/);
  assert.match(widget, /showPhasePrompt/);
  assert.match(widget, /TOCCA PER CONTINUARE/);
  assert.doesNotMatch(widget, /onGesture|widget\.BUTTON/);
});
