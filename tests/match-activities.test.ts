import assert from "node:assert/strict";
import test from "node:test";
import { matchDay, workoutForActivity, type MatchActivity, type MatchWorkout } from "../lib/plan/match-activities.ts";

const workout = (id: string, km: number, extra: Partial<MatchWorkout> = {}): MatchWorkout => ({
  id, type: "easy", status: "planned", target_distance_m: km * 1000, target_duration_s: null, workout_steps: [], ...extra,
});
// started_at in UTC: novembre = UTC+1 a Roma.
const run = (id: string, startedAt: string, km: number, minutes: number, sport = "running"): MatchActivity => ({
  id, started_at: startedAt, sport, distance_m: km * 1000, duration_s: minutes * 60,
});

test("riscaldamento e ripetute: ogni corsa va con la sua seduta", () => {
  const plan = [workout("warmup", 2, { day_order: 1 }), workout("reps", 6, { type: "interval", day_order: 2, chained: true } as Partial<MatchWorkout>)];
  const done = [run("a", "2026-11-14T16:00:00Z", 2.1, 12), run("b", "2026-11-14T16:14:00Z", 6.3, 32)];
  const match = matchDay(plan, done);
  assert.equal(match.get("warmup"), "a");
  assert.equal(match.get("reps"), "b");
});

test("non è per forza la prima corsa: conta quanto si somigliano", () => {
  // In programma una sola seduta da 10 km; al mattino 3 km di sciolto, la sera i 10 km.
  const plan = [workout("long", 10)];
  const done = [run("morning", "2026-11-14T06:30:00Z", 3, 18), run("evening", "2026-11-14T17:30:00Z", 10.2, 55)];
  assert.equal(matchDay(plan, done).get("long"), "evening");
  assert.equal(workoutForActivity("morning", plan, done), null);
  assert.equal(workoutForActivity("evening", plan, done)?.id, "long");
});

test("mattina e sera: decide il momento della giornata a parità di distanza", () => {
  const plan = [workout("am", 8, { day_part: "morning", day_order: 1 }), workout("pm", 8, { day_part: "evening", day_order: 2 })];
  // Elencate al contrario: l'ordine di arrivo non conta.
  const done = [run("evening", "2026-11-14T18:00:00Z", 8, 44), run("morning", "2026-11-14T06:00:00Z", 8, 45)];
  const match = matchDay(plan, done);
  assert.equal(match.get("am"), "morning");
  assert.equal(match.get("pm"), "evening");
});

test("una seduta di corsa non si abbina a un'altra attività; le sedute in pausa non contano", () => {
  const plan = [workout("easy", 6), workout("paused", 6, { status: "skipped" })];
  const done = [run("bike", "2026-11-14T08:00:00Z", 20, 50, "cycling")];
  assert.equal(matchDay(plan, done).size, 0);
  const cross = [workout("gym", 0, { type: "cross", target_distance_m: null, target_duration_s: 3600 })];
  assert.equal(matchDay(cross, done).get("gym"), "bike");
});

test("una sola seduta e una sola corsa diversa: è comunque quella", () => {
  const plan = [workout("tempo", 10, { type: "tempo" })];
  const done = [run("short", "2026-11-14T08:00:00Z", 4, 25)];
  assert.equal(matchDay(plan, done).get("tempo"), "short");
});
