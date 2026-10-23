import assert from "node:assert/strict";
import test from "node:test";
import type { ATLCTLResult, WorkoutStepInput } from "../lib/types.ts";
import {
  formatIntervalsDuration,
  groupRepeats,
  intervalsExternalId,
  isZittoExternalId,
  stepTarget,
  workoutDescription,
  workoutToIntervalsDraft,
} from "../lib/intervals/workout-text.ts";
import { computeZeppReadiness, hrvScore } from "../lib/zepp/readiness.ts";
import type { WellnessDay } from "../lib/zepp/types.ts";

function step(overrides: Partial<WorkoutStepInput>): WorkoutStepInput {
  return {
    kind: "steady",
    label: "Corsa",
    completion_type: "time",
    completion_value: 600,
    pace_min_s_km: null,
    pace_max_s_km: null,
    hr_min_bpm: null,
    hr_max_bpm: null,
    ...overrides,
  };
}

const ctx = { max_hr: 190, preference: "auto" as const };

const intervals: WorkoutStepInput[] = [
  step({ kind: "warmup", label: "Riscaldamento", completion_value: 900, hr_min_bpm: 120, hr_max_bpm: 145 }),
  ...Array.from({ length: 6 }, () => [
    step({ kind: "work", label: "1000", completion_type: "distance", completion_value: 1000, pace_min_s_km: 250, pace_max_s_km: 260, hr_max_bpm: 180 }),
    step({ kind: "recovery", label: "Recupero", completion_value: 120, hr_max_bpm: 140, variant: "jog" }),
  ]).flat(),
  step({ kind: "cooldown", label: "Defaticamento", completion_value: 600, hr_max_bpm: 140 }),
];

test("durate nel formato del workout builder", () => {
  assert.equal(formatIntervalsDuration(step({ completion_value: 600 })), "10m");
  assert.equal(formatIntervalsDuration(step({ completion_value: 90 })), "1m30");
  assert.equal(formatIntervalsDuration(step({ completion_value: 45 })), "45s");
  assert.equal(formatIntervalsDuration(step({ completion_type: "distance", completion_value: 1000 })), "1km");
  assert.equal(formatIntervalsDuration(step({ completion_type: "distance", completion_value: 400 })), "400mtr");
  assert.equal(formatIntervalsDuration(step({ completion_type: "distance", completion_value: 1500 })), "1.5km");
  assert.equal(formatIntervalsDuration(step({ completion_type: "manual", completion_value: null })), "20m");
});

test("un solo target per fase: passo nel lavoro, FC nel resto", () => {
  assert.equal(stepTarget(intervals[1], ctx), "4:20-4:10/km Pace");
  assert.equal(stepTarget(intervals[0], ctx), "63-76% HR");
  assert.equal(stepTarget(intervals[1], { ...ctx, preference: "hr" }), "85-95% HR");
  assert.equal(stepTarget(intervals[0], { ...ctx, preference: "pace" }), "63-76% HR");
  assert.equal(stepTarget(intervals[0], { max_hr: null, preference: "auto" }), null);
});

test("le ripetute identiche diventano un blocco Nx", () => {
  const blocks = groupRepeats(intervals.slice(1, -1));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].repeat, 6);
  assert.equal(blocks[0].steps.length, 2);
  const mixed = groupRepeats([step({}), step({ completion_value: 300 }), step({ completion_value: 300 })]);
  assert.deepEqual(mixed.map((block) => block.repeat), [1, 2]);
});

test("descrizione completa con sezioni e ripetute", () => {
  assert.equal(workoutDescription(intervals, ctx), [
    "Warmup",
    "- Riscaldamento 15m 63-76% HR",
    "",
    "Main Set 6x",
    "- Ripetuta 1km 4:20-4:10/km Pace",
    "- Recupero 2m 64-74% HR",
    "",
    "Cooldown",
    "- Defaticamento 10m 64-74% HR",
  ].join("\n"));
});

test("allunghi e ripetute: ogni blocco Nx è un paragrafo separato", () => {
  const sprint = step({ kind: "work", label: "Allungo", completion_value: 20, variant: "sprint" });
  const walk = (seconds: number) => step({ kind: "recovery", label: "Cammina", completion_value: seconds, variant: "walk" });
  const rep = step({ kind: "work", label: "1000", completion_type: "distance", completion_value: 1000, pace_min_s_km: 298, pace_max_s_km: 312 });
  const jog = step({ kind: "recovery", label: "Recupero", completion_value: 120, pace_min_s_km: 420, pace_max_s_km: 540, variant: "jog" });
  const steps = [
    step({ kind: "warmup", label: "Riscaldamento", completion_value: 600, hr_min_bpm: 100, hr_max_bpm: 135 }),
    sprint, walk(40), sprint, walk(40), sprint, walk(60),
    rep, jog, rep, jog, rep, jog, rep,
    step({ kind: "cooldown", label: "Defaticamento", completion_value: 300, hr_max_bpm: 135 }),
  ];
  assert.equal(workoutDescription(steps, ctx), [
    "Warmup",
    "- Riscaldamento 10m 53-71% HR",
    "",
    "Main Set 2x",
    "- Sprint 20s",
    "- Cammina 40s",
    "",
    "- Sprint 20s",
    "- Cammina 1m",
    "",
    "3x",
    "- Ripetuta 1km 5:12-4:58/km Pace",
    "- Recupero 2m 9:00-7:00/km Pace",
    "",
    "- Ripetuta 1km 5:12-4:58/km Pace",
    "",
    "Cooldown",
    "- Defaticamento 5m 61-71% HR",
  ].join("\n"));
  const draft = workoutToIntervalsDraft({
    id: "x", date: "2026-10-27", title: "Ripetute", target_distance_m: 7000, target_duration_s: 2700, steps,
  }, ctx);
  assert.equal(draft.name, "Ripetute · 4×1 km");
  const stridesOnly = workoutToIntervalsDraft({
    id: "y", date: "2026-10-27", title: "Corsa facile", target_distance_m: null, target_duration_s: null,
    steps: [step({}), sprint, walk(40), sprint, walk(40)],
  }, ctx);
  assert.equal(stridesOnly.name, 'Corsa facile · 2×20"');
});

test("evento WORKOUT con id esterno riconoscibile", () => {
  const draft = workoutToIntervalsDraft({
    id: "abc", date: "2026-10-24", title: "Ripetute", target_distance_m: null, target_duration_s: null, steps: intervals,
  }, ctx);
  assert.equal(draft.category, "WORKOUT");
  assert.equal(draft.type, "Run");
  assert.equal(draft.start_date_local, "2026-10-24T00:00:00");
  assert.equal(draft.name, "Ripetute · 6×1 km");
  assert.equal(draft.external_id, intervalsExternalId("abc"));
  assert.ok(isZittoExternalId(draft.external_id));
  assert.ok(!isZittoExternalId("manual-123"));
});

const internal: ATLCTLResult = {
  load7: 200, atl: 40, ctl: 30, tsb: -10, baseline7: 180, load_ratio: 1.11,
  status: "balanced", confidence: "high", history_days: 60,
  sources: { heart_rate: 2, rpe: 1, estimated: 0 }, series: [],
};

function day(date: string, overrides: Partial<WellnessDay> = {}): WellnessDay {
  return {
    date, captured_at: `${date}T07:00:00.000Z`, source: "intervals",
    sleep_secs: 7.5 * 3600, sleep_score: null, resting_hr: 50, hrv: 60, spo2: null, steps: null,
    ...overrides,
  };
}

test("HRV sotto la propria mediana abbassa il punteggio", () => {
  assert.equal(hrvScore(60, null), 70);
  assert.equal(hrvScore(62, 60), 90);
  assert.equal(hrvScore(50, 60), 25);
});

test("readiness dal solo wellness Intervals.icu, senza Mini App Zepp", () => {
  const history = Array.from({ length: 10 }, (_, index) => day(`2026-10-${String(11 + index).padStart(2, "0")}`));
  const good = computeZeppReadiness([], internal, new Date("2026-10-21T09:00:00.000Z"), false, [day("2026-10-21", { hrv: 64 }), ...history]);
  assert.equal(good.available, true);
  assert.equal(good.source, "wellness");
  assert.deepEqual(good.components.map((part) => part.key), ["hrv", "sleep", "resting_hr", "internal_load"]);
  const tired = computeZeppReadiness([], internal, new Date("2026-10-21T09:00:00.000Z"), false, [day("2026-10-21", { hrv: 42, resting_hr: 58 }), ...history]);
  assert.ok((tired.score ?? 0) < (good.score ?? 0) - 20);
});

test("senza HRV né dati Zepp il wellness da solo non basta", () => {
  const result = computeZeppReadiness([], internal, new Date("2026-10-21T09:00:00.000Z"), false, [day("2026-10-21", { hrv: null })]);
  assert.equal(result.available, false);
});

test("wellness vecchio non modifica lo stato", () => {
  const result = computeZeppReadiness([], internal, new Date("2026-10-25T09:00:00.000Z"), false, [day("2026-10-21")]);
  assert.equal(result.available, false);
  assert.ok((result.freshness_hours ?? 0) > 36);
});
