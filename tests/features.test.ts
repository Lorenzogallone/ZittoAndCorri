import assert from "node:assert/strict";
import test from "node:test";
import { bestEffortsForActivity, bestEffortsFromGps, personalRecords } from "../lib/metrics/best-efforts.ts";
import { predictionReference, predictRaceTimes } from "../lib/metrics/race-prediction.ts";
import { checkPace } from "../lib/metrics/pace-check.ts";
import { adjustStepsForHeat, heatSlowdownPct } from "../lib/metrics/heat.ts";
import { adherence, dayState } from "../lib/plan/day-status.ts";
import { weeklyVolume } from "../lib/plan/weekly.ts";
import { trainingPhases } from "../lib/plan/phases.ts";
import { adaptWorkout, originalFields, type AdaptableWorkout } from "../lib/plan/adapt.ts";
import { racePacing } from "../lib/plan/race.ts";
import { recoveryWorkouts } from "../lib/plan/recovery.ts";
import { estimateWorkout } from "../lib/workout-estimate.ts";
import { addDays, mondayOf, romeDay } from "../lib/local-date.ts";
import type { GpsPoint, WorkoutStep, WorkoutStepInput } from "../lib/types.ts";

// Traccia sintetica verso nord: ogni secondo percorre `speeds[i]` metri.
function track(speeds: number[]): GpsPoint[] {
  const metersPerDegree = 111_195;
  const points: GpsPoint[] = [{ t: 0, lat: 45, lon: 9 }];
  let lat = 45;
  speeds.forEach((speed, index) => {
    lat += speed / metersPerDegree;
    points.push({ t: index + 1, lat, lon: 9 });
  });
  return points;
}

const repeat = (value: number, times: number) => Array.from({ length: times }, () => value);

function step(partial: Partial<WorkoutStepInput>): WorkoutStepInput {
  return {
    kind: "steady",
    label: "Corsa",
    completion_type: "time",
    completion_value: 600,
    pace_min_s_km: null,
    pace_max_s_km: null,
    hr_min_bpm: null,
    hr_max_bpm: null,
    ...partial,
  };
}

test("il best effort trova la finestra più veloce sulla distanza", () => {
  // 1 km lento (2,5 m/s), 1 km veloce (4 m/s), 1 km lento.
  const gps = track([...repeat(2.5, 400), ...repeat(4, 250), ...repeat(2.5, 400)]);
  const efforts = bestEffortsFromGps(gps);
  assert.ok(efforts["1k"] != null);
  assert.ok(Math.abs(efforts["1k"]! - 250) <= 2, `1k = ${efforts["1k"]}`);
  assert.equal(efforts["5k"], undefined);
});

test("senza GPS conta solo una corsa lunga quanto una distanza standard", () => {
  assert.deepEqual(
    bestEffortsForActivity({ sport: "running", distance_m: 10_050, duration_s: 2_800 }),
    { "10k": 2_786 },
  );
  assert.deepEqual(bestEffortsForActivity({ sport: "running", distance_m: 8_000, duration_s: 2_400 }), {});
  assert.equal(bestEffortsForActivity({ sport: "cycling", distance_m: 10_000, duration_s: 1_200 }), null);
});

test("i record personali scelgono il tempo migliore per distanza", () => {
  const records = personalRecords([
    { id: "a", started_at: "2026-05-01T08:00:00Z", best_efforts: { "5k": 1_500, "1k": 280 } },
    { id: "b", started_at: "2026-06-01T08:00:00Z", best_efforts: { "5k": 1_450 } },
    { id: "c", started_at: "2026-07-01T08:00:00Z", best_efforts: null },
  ]);
  assert.deepEqual(records.map((r) => [r.key, r.time_s, r.activity_id]), [["1k", 280, "a"], ["5k", 1_450, "b"]]);
});

test("la previsione usa il miglior 10 km equivalente", () => {
  const reference = predictionReference([
    { id: "a", sport: "running", distance_m: 12_000, active_s: 4_000, best_efforts: { "5k": 1_500, "10k": 3_100 } },
    { id: "b", sport: "running", distance_m: 6_000, active_s: 1_900, best_efforts: { "5k": 1_440 } },
  ]);
  assert.deepEqual(reference, { meters: 5_000, time_s: 1_440, activity_id: "b" });
  const times = predictRaceTimes(reference!);
  assert.equal(times[0].time_s, 1_440);
  assert.ok(times[1].time_s > 2 * 1_440);
});

test("la verifica del passo riconosce ripetute più veloci del previsto", () => {
  // Riscaldamento lento, 3 × 400 m a 4,4 m/s (~3:47/km) con recupero lento.
  const speeds = [
    ...repeat(2.6, 300),
    ...repeat(4.4, 91), ...repeat(2, 90),
    ...repeat(4.4, 91), ...repeat(2, 90),
    ...repeat(4.4, 91),
    ...repeat(2.6, 300),
  ];
  const work = step({ kind: "work", completion_type: "distance", completion_value: 400, pace_min_s_km: 250, pace_max_s_km: 260 });
  const recovery = step({ kind: "recovery", completion_type: "time", completion_value: 90 });
  const result = checkPace(track(speeds), [step({ kind: "warmup" }), work, recovery, work, recovery, work, step({ kind: "cooldown" })]);
  assert.ok(result);
  assert.equal(result.reps.length, 3);
  assert.equal(result.status, "fast");
  assert.ok(result.reps.every((rep) => rep.pace_s_km < 250));
});

test("la verifica del passo è in linea su un tempo corso al ritmo giusto", () => {
  const speeds = [...repeat(2.6, 300), ...repeat(1000 / 270, 900), ...repeat(2.6, 300)];
  const result = checkPace(track(speeds), [
    step({ kind: "warmup" }),
    step({ kind: "steady", completion_type: "time", completion_value: 900, pace_min_s_km: 265, pace_max_s_km: 275 }),
    step({ kind: "cooldown" }),
  ]);
  assert.equal(result?.status, "on_target");
  assert.equal(checkPace(track(speeds), [step({ kind: "steady" })]), null);
});

test("il caldo rallenta i passi solo oltre la soglia", () => {
  assert.equal(heatSlowdownPct(18, 8), 0);
  assert.equal(heatSlowdownPct(20, 10), 0);
  // 21° e afoso la sera non è caldo: niente passi rallentati.
  assert.equal(heatSlowdownPct(21, 18), 0);
  assert.equal(heatSlowdownPct(23, 21), 0);
  // Caldo ma secco: l'effetto è trascurabile.
  assert.equal(heatSlowdownPct(24, 8), 0);
  assert.ok(heatSlowdownPct(26, 18) >= 2);
  const hot = heatSlowdownPct(30, 20);
  assert.ok(hot > 3 && hot < 6, `pct = ${hot}`);
  const [adjusted] = adjustStepsForHeat([step({ pace_min_s_km: 300, pace_max_s_km: 310 })], 4);
  assert.deepEqual([adjusted.pace_min_s_km, adjusted.pace_max_s_km], [312, 322]);
});

test("lo stato del giorno distingue fatto, saltato e riposo", () => {
  const today = "2026-10-16";
  const run = [{ sport: "running" }];
  assert.equal(dayState({ date: "2026-10-14", today, planned: [{ type: "easy", status: "planned" }], activities: run }), "done");
  assert.equal(dayState({ date: "2026-10-14", today, planned: [{ type: "easy", status: "planned" }], activities: [] }), "missed");
  assert.equal(dayState({ date: today, today, planned: [{ type: "easy", status: "planned" }], activities: [] }), "today");
  assert.equal(dayState({ date: "2026-10-18", today, planned: [], activities: [] }), "rest");
  assert.equal(dayState({ date: "2026-10-14", today, planned: [], activities: run }), "extra");
  assert.equal(dayState({ date: "2026-10-14", today, planned: [{ type: "cross", status: "planned" }], activities: [{ sport: "strength" }] }), "done");
  assert.equal(dayState({ date: "2026-10-18", today, planned: [{ type: "easy", status: "skipped" }], activities: [] }), "skipped");
  assert.deepEqual(adherence(["done", "missed", "today", "rest", "done"]), { done: 2, due: 3 });
});

test("il volume settimanale somma corse e sedute previste per settimana", () => {
  const weeks = weeklyVolume(
    [
      { started_at: "2026-10-13T07:00:00Z", sport: "running", distance_m: 8_000 },
      { started_at: "2026-10-12T21:30:00Z", sport: "running", distance_m: 5_000 }, // lunedì a Roma
      { started_at: "2026-10-14T07:00:00Z", sport: "cycling", distance_m: 30_000 },
    ],
    [
      { date: "2026-10-15", type: "easy", target_distance_m: 6_000 },
      { date: "2026-10-20", type: "long", target_duration_s: 3_600, target_pace_s_km: 360 },
      { date: "2026-10-21", type: "easy", target_distance_m: 9_000, status: "skipped" },
    ],
    "2026-10-12",
    2,
  );
  assert.deepEqual(weeks, [
    { week_start: "2026-10-12", done_m: 13_000, planned_m: 6_000 },
    { week_start: "2026-10-19", done_m: 0, planned_m: 10_000 },
  ]);
});

test("le fasi finiscono il giorno prima della gara", () => {
  const plan = trainingPhases({ race_date: "2027-03-21", distance_m: 42_195, start_date: "2026-11-01", today: "2026-12-15" });
  assert.ok(plan);
  assert.deepEqual(plan.phases.map((p) => p.key), ["base", "build", "peak", "taper"]);
  assert.equal(plan.phases.at(-1)!.end, "2027-03-20");
  assert.equal(plan.phases[0].start, "2026-11-01");
  assert.equal(plan.current, "base");
  assert.equal(trainingPhases({ race_date: "2027-03-21", distance_m: 42_195, start_date: "2026-11-01", today: "2027-01-10" })?.current, "build");
  assert.equal(trainingPhases({ race_date: null, distance_m: 10_000, start_date: "2026-11-01", today: "2026-12-15" }), null);
  const short = trainingPhases({ race_date: "2026-12-20", distance_m: 10_000, start_date: "2026-12-10", today: "2026-12-15" });
  assert.deepEqual(short?.phases.map((p) => p.key), ["build", "taper"]);
});

function workout(partial: Partial<AdaptableWorkout>): AdaptableWorkout {
  const steps: WorkoutStep[] = [
    { ...step({ kind: "warmup", completion_value: 600 }), id: "step-1", order: 0 },
    ...[0, 1, 2, 3, 4, 5].flatMap((i) => [
      { ...step({ kind: "work", completion_type: "distance", completion_value: 400, pace_min_s_km: 250, pace_max_s_km: 260 }), id: `w${i}`, order: 1 + i * 2 },
      { ...step({ kind: "recovery", completion_value: 90 }), id: `r${i}`, order: 2 + i * 2 },
    ]),
    { ...step({ kind: "cooldown", completion_value: 600 }), id: "step-x", order: 99 },
  ];
  return {
    type: "interval",
    status: "planned",
    target_distance_m: 8_000,
    target_duration_s: null,
    target_pace_s_km: null,
    target_hr_bpm: null,
    workout_steps: steps,
    description: "Ripetute",
    focus: "Focus",
    ...partial,
  };
}

test("alleggerire trasforma la qualità in corsa facile e si può annullare", () => {
  const original = workout({});
  const tired = adaptWorkout(original, "tired")!;
  assert.equal(tired.type, "easy");
  assert.equal(tired.workout_steps!.length, 1);
  assert.equal(tired.target_distance_m, 5_500);
  assert.equal(tired.target_pace_s_km, null);
  assert.equal(originalFields(original, tired).type, "interval");

  const busy = adaptWorkout(original, "busy")!;
  const reps = busy.workout_steps!.filter((s) => s.kind === "work").length;
  assert.equal(reps, 4);
  assert.equal(busy.workout_steps!.at(-1)!.kind, "cooldown");

  assert.deepEqual(adaptWorkout(original, "sick"), { status: "skipped" });
  assert.equal(adaptWorkout(workout({ type: "cross" }), "tired"), null);
  assert.equal(adaptWorkout(workout({ status: "completed" }), "tired"), null);
});

test("la strategia di gara divide il tempo obiettivo in passaggi", () => {
  const pacing = racePacing(21_097, 6_300)!;
  assert.equal(pacing.pace_s_km, 299);
  assert.deepEqual(pacing.checkpoints.map((c) => c.label), ["5 km", "10 km", "15 km", "20 km", "Arrivo"]);
  assert.equal(pacing.checkpoints.at(-1)!.elapsed_s, 6_300);
  assert.equal(racePacing(5_000, 1_500)!.checkpoints.length, 5);
  assert.ok(racePacing(42_195, 12_600)!.checkpoints.some((c) => c.label === "Mezza"));
});

test("il recupero post-gara parte da oggi e resta facile", () => {
  const plan = recoveryWorkouts({ race_date: "2026-10-12", distance_m: 21_097, today: "2026-10-16", hr_cap: 150 });
  assert.deepEqual(plan.map((w) => w.date), ["2026-10-17", "2026-10-19", "2026-10-21"]);
  assert.ok(plan.every((w) => w.workout_steps[0].hr_max_bpm === 150));
});

test("le date locali seguono Europe/Rome", () => {
  assert.equal(romeDay("2026-10-12T22:30:00Z"), "2026-10-13");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("la stima della seduta somma tempi e distanze delle fasi", () => {
  const estimate = estimateWorkout([
    step({ kind: "warmup", completion_value: 600, pace_min_s_km: 360, pace_max_s_km: 360 }),
    step({ kind: "work", completion_type: "distance", completion_value: 1_000, pace_min_s_km: 240, pace_max_s_km: 240 }),
  ]);
  assert.equal(Math.round(estimate.seconds), 840);
  assert.equal(Math.round(estimate.meters), 2_667);
});

test("i totali per periodo contano la corsa e confrontano con il periodo prima", async () => {
  const { periodTotals } = await import("../lib/metrics/totals.ts");
  const run = (day: string, km: number, extra: Partial<{ sport: string; elevation_gain_m: number }> = {}) => ({
    started_at: `${day}T07:00:00Z`,
    sport: "running",
    distance_m: km * 1000,
    duration_s: km * 330,
    elevation_gain_m: 10,
    ...extra,
  });
  const totals = periodTotals([
    run("2026-10-14", 10),
    run("2026-10-02", 8),
    run("2026-09-10", 12),
    run("2026-09-25", 30), // oltre il 16 settembre: fuori dal confronto mensile
    run("2025-06-01", 21),
    run("2026-10-15", 6, { sport: "hiking" }),
  ], "2026-10-16");
  const byKey = Object.fromEntries(totals.map((t) => [t.key, t]));
  assert.equal(byKey.week.running_m, 10_000);
  assert.equal(byKey.month.running_m, 18_000);
  assert.equal(byKey.month.previous_m, 12_000);
  assert.equal(byKey.month.walking_m, 6_000);
  assert.equal(byKey.year.running_m, 60_000);
  assert.equal(byKey.year.longest_m, 30_000);
  assert.equal(byKey.year.previous_m, 21_000);
  assert.equal(byKey.all.runs, 5);
  assert.equal(byKey.all.previous_m, null);
});

test("i dati Zepp vecchi vengono ignorati", async () => {
  const { isZeppFresh, resolveEffectiveHrConfig } = await import("../lib/zepp/hr-values.ts");
  const now = new Date("2026-10-16T12:00:00Z");
  assert.equal(isZeppFresh("2026-10-15T08:00:00Z", 3, now), true);
  assert.equal(isZeppFresh("2026-10-10T08:00:00Z", 3, now), false);
  assert.equal(isZeppFresh(null, 3, now), false);
  // Senza metriche fresche si usano i valori manuali.
  const config = resolveEffectiveHrConfig({ max_hr: 188, resting_hr: 50 }, [], true);
  assert.equal(config.max_hr_source, "user");
  assert.equal(config.max_hr, 188);
});
