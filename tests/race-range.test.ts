import assert from "node:assert/strict";
import test from "node:test";
import { predictRange, racePaceAdvice, riegel } from "../lib/metrics/predict.ts";
import { enduranceBase, goalRaceRange, type PredictionReference } from "../lib/metrics/race-prediction.ts";

const HALF = 21_097;
const TODAY = "2026-11-22";
// The athlete: 5 km in 25:20 on 14 November, ~20 km a week, longest run 13 km.
const athlete: PredictionReference = { meters: 5_000, time_s: 1_520, activity_id: "t", started_at: "2026-11-14T08:00:00Z" };
const lowBase = { weekly_km: 20, longest_m: 13_000 };
const trainedBase = { weekly_km: 55, longest_m: 21_000 };

const range = (base: { weekly_km: number; longest_m: number }, age = 8, target = HALF) =>
  predictRange({ reference: athlete, reference_age_days: age, target_m: target, base });

test("athlete's range: contains ~2:03 and is more cautious than pure Riegel", () => {
  const r = range(lowBase);
  const pure = riegel(5_000, 1_520, HALF);
  assert.ok(r.optimistic_s <= 7_380 && 7_380 <= r.prudent_s, `${r.optimistic_s}–${r.prudent_s}`);
  assert.ok(r.central_s > pure + 180, "la centrale è almeno 3 minuti oltre Riegel");
  assert.ok(r.prudent_s > pure + 420, "l'estremo prudente è almeno 7 minuti oltre Riegel");
  assert.ok(Math.abs(r.optimistic_s - pure) <= 10, "l'ottimistica resta Riegel classico");
});

test("the range is ordered", () => {
  for (const base of [lowBase, trainedBase, { weekly_km: 0, longest_m: 0 }]) {
    for (const target of [3_000, 5_000, 10_000, HALF, 42_195]) {
      const r = range(base, 60, target);
      assert.ok(r.optimistic_s <= r.central_s && r.central_s <= r.prudent_s, `${target}`);
    }
  }
});

test("less volume or a shorter long run: wider and slower range", () => {
  const trained = range(trainedBase);
  const low = range(lowBase);
  const shortLong = range({ weekly_km: 55, longest_m: 10_000 });
  assert.ok(low.prudent_s - low.optimistic_s > trained.prudent_s - trained.optimistic_s);
  assert.ok(low.central_s > trained.central_s);
  assert.ok(shortLong.central_s > trained.central_s);
});

test("an old reference widens the range both ways", () => {
  const fresh = range(lowBase, 5);
  const old = range(lowBase, 90);
  assert.ok(old.optimistic_s < fresh.optimistic_s);
  assert.ok(old.prudent_s > fresh.prudent_s);
  assert.equal(old.central_s, fresh.central_s);
});

test("on distances no longer than the reference the volume doesn't weigh", () => {
  const low = range({ weekly_km: 5, longest_m: 5_000 }, 8, 5_000);
  const trained = range(trainedBase, 8, 5_000);
  assert.deepEqual([low.optimistic_s, low.central_s, low.prudent_s], [trained.optimistic_s, trained.central_s, trained.prudent_s]);
  assert.equal(low.central_s, 1_520);
});

test("a trained runner stays close to Riegel", () => {
  const r = range(trainedBase);
  const pure = riegel(5_000, 1_520, HALF);
  assert.ok(r.central_s - pure < 120, `${r.central_s - pure}`);
});

test("goal inside, too fast or too slow compared to the range", () => {
  const r = range(lowBase);
  const inside = racePaceAdvice(r, 7_199);
  assert.equal(inside.goal_fit, "inside");
  assert.equal(inside.goal_ambitious, true);
  // The starting pace is not the goal pace (5:41/km): it stays on the central one.
  assert.ok(inside.fast_s_km > inside.goal_pace_s_km!);
  assert.equal(racePaceAdvice(r, 6_600).goal_fit, "too_fast");
  const slow = racePaceAdvice(r, 8_100);
  assert.equal(slow.goal_fit, "too_slow");
  assert.ok(slow.fast_s_km >= Math.round(8_100 / 21.097) - 5);
  const none = racePaceAdvice(r, null);
  assert.equal(none.goal_fit, null);
  assert.ok(none.fast_s_km < none.slow_s_km);
});

test("volume and long run from recent runs", () => {
  const base = enduranceBase([
    { sport: "running", started_at: "2026-11-20T07:00:00Z", distance_m: 8_000 },
    { sport: "running", started_at: "2026-11-16T07:00:00Z", distance_m: 13_000 },
    { sport: "running", started_at: "2026-11-05T07:00:00Z", distance_m: 6_000 },
    { sport: "running", started_at: "2026-10-30T07:00:00Z", distance_m: 6_000 },
    { sport: "running", started_at: "2026-10-10T07:00:00Z", distance_m: 15_000 },
    { sport: "cycling", started_at: "2026-11-18T07:00:00Z", distance_m: 60_000 },
  ], TODAY);
  assert.equal(base.weekly_km, 8.3); // 33 km in 4 weeks
  assert.equal(base.longest_m, 15_000);
});

test("explanation and advice in plain Italian", () => {
  const result = goalRaceRange(athlete, lowBase, { distance_m: HALF, target_time_s: 7_199 }, TODAY);
  assert.match(result.explanation, /^Si basa sui 5 km del 14 nov/);
  assert.match(result.explanation, /volume basso \(20 km a settimana\)/);
  assert.match(result.explanation, /lungo corto \(massimo 13 km\)/);
  assert.match(result.explanation, /verso il prudente/);
  assert.match(result.advice_text, /dentro la forbice ma sul lato veloce/);
  const trained = goalRaceRange(athlete, trainedBase, { distance_m: HALF, target_time_s: null }, TODAY);
  assert.match(trained.explanation, /Volume e lungo sono adeguati/);
  const fromHalf = goalRaceRange({ ...athlete, meters: HALF, time_s: 7_300, started_at: "2026-12-20T09:00:00Z" }, lowBase, { distance_m: HALF, target_time_s: null }, "2026-12-27");
  assert.match(fromHalf.explanation, /^Si basa sulla mezza del 20 dic/);
  const fromRun = goalRaceRange({ ...athlete, meters: 7_400 }, lowBase, { distance_m: HALF, target_time_s: null }, TODAY);
  assert.match(fromRun.explanation, /^Si basa sui 7,4 km del/);
});
