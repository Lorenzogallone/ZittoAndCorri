import assert from "node:assert/strict";
import test from "node:test";
import { adherence, buildDays } from "../lib/plan/day-status.ts";
import { matchDay, matchPlan, planWorkoutForActivity, withinWindow, workoutForActivity, type MatchActivity, type MatchWorkout, type PlanMatchActivity, type PlanMatchWorkout } from "../lib/plan/match-activities.ts";

const workout = (id: string, km: number, extra: Partial<MatchWorkout> = {}): MatchWorkout => ({
  id, type: "easy", status: "planned", target_distance_m: km * 1000, target_duration_s: null, workout_steps: [], ...extra,
});
// started_at in UTC: November = UTC+1 in Rome.
const run = (id: string, startedAt: string, km: number, minutes: number, sport = "running"): MatchActivity => ({
  id, started_at: startedAt, sport, distance_m: km * 1000, duration_s: minutes * 60,
});

test("warm-up and repeats: each run goes with its session", () => {
  const plan = [workout("warmup", 2, { day_order: 1 }), workout("reps", 6, { type: "interval", day_order: 2, chained: true } as Partial<MatchWorkout>)];
  const done = [run("a", "2026-11-14T16:00:00Z", 2.1, 12), run("b", "2026-11-14T16:14:00Z", 6.3, 32)];
  const match = matchDay(plan, done);
  assert.equal(match.get("warmup"), "a");
  assert.equal(match.get("reps"), "b");
});

test("it's not necessarily the first run: similarity counts", () => {
  // One 10 km session planned; in the morning 3 km easy, in the evening the 10 km.
  const plan = [workout("long", 10)];
  const done = [run("morning", "2026-11-14T06:30:00Z", 3, 18), run("evening", "2026-11-14T17:30:00Z", 10.2, 55)];
  assert.equal(matchDay(plan, done).get("long"), "evening");
  assert.equal(workoutForActivity("morning", plan, done), null);
  assert.equal(workoutForActivity("evening", plan, done)?.id, "long");
});

test("morning and evening: time of day decides at equal distance", () => {
  const plan = [workout("am", 8, { day_part: "morning", day_order: 1 }), workout("pm", 8, { day_part: "evening", day_order: 2 })];
  // Listed in reverse: arrival order doesn't matter.
  const done = [run("evening", "2026-11-14T18:00:00Z", 8, 44), run("morning", "2026-11-14T06:00:00Z", 8, 45)];
  const match = matchDay(plan, done);
  assert.equal(match.get("am"), "morning");
  assert.equal(match.get("pm"), "evening");
});

test("a run session doesn't match another activity; paused sessions don't count", () => {
  const plan = [workout("easy", 6), workout("paused", 6, { status: "skipped" })];
  const done = [run("bike", "2026-11-14T08:00:00Z", 20, 50, "cycling")];
  assert.equal(matchDay(plan, done).size, 0);
  const cross = [workout("gym", 0, { type: "cross", target_distance_m: null, target_duration_s: 3600 })];
  assert.equal(matchDay(cross, done).get("gym"), "bike");
});

test("a single session and a single different run: it's that one anyway", () => {
  const plan = [workout("tempo", 10, { type: "tempo" })];
  const done = [run("short", "2026-11-14T08:00:00Z", 4, 25)];
  assert.equal(matchDay(plan, done).get("tempo"), "short");
});

// ── Sessions moved to another day ───────────────────────────────────────────────

const session = (id: string, date: string, type: PlanMatchWorkout["type"], km: number, extra: Partial<PlanMatchWorkout> = {}): PlanMatchWorkout & { status: string } => ({
  id, date, type, status: "planned", target_distance_m: km * 1000, target_duration_s: null, workout_steps: [], ...extra,
});
const typedRun = (id: string, day: string, type: string, km: number, minutes = km * 5.5): PlanMatchActivity => ({
  id, started_at: `${day}T17:00:00Z`, sport: "running", distance_m: km * 1000, duration_s: minutes * 60, type,
});

test("Tuesday's session done on Wednesday or Thursday: counts as done", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10)];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "tempo", 10)]).get("tue"), "wed");
  assert.equal(matchPlan(plan, [typedRun("thu", "2026-11-19", "tempo", 10)]).get("tue"), "thu");
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "tempo", 10)]).get("tue"), "mon");
  // Three days later is something else.
  assert.equal(matchPlan(plan, [typedRun("fri", "2026-11-20", "tempo", 10)]).size, 0);
});

test("incompatible type: an easy run doesn't count for another day's repeats", () => {
  const plan = [session("reps", "2026-11-17", "interval", 8)];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "easy", 8)]).size, 0);
  // Easy and recovery are equivalent.
  const easy = [session("easy", "2026-11-17", "easy", 6)];
  assert.equal(matchPlan(easy, [typedRun("wed", "2026-11-18", "recovery", 6)]).get("easy"), "wed");
  // Race and cross stay on their own day.
  const race = [session("race", "2026-11-17", "race", 10)];
  assert.equal(matchPlan(race, [typedRun("wed", "2026-11-18", "race", 10)]).size, 0);
});

test("run not yet classified: counts only if it resembles the session", () => {
  const plan = [session("long", "2026-11-15", "long", 18)];
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "unclassified", 17.5, 100)]).get("long"), "mon");
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "unclassified", 6, 33)]).size, 0);
});

test("two candidate sessions: the closest wins, then the one left behind", () => {
  const run = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const near = matchPlan([session("mon", "2026-11-16", "tempo", 10), session("tue", "2026-11-17", "tempo", 10)], run);
  assert.equal(near.get("tue"), "wed");
  assert.equal(near.has("mon"), false);
  const tie = matchPlan([session("thu", "2026-11-19", "tempo", 10), session("tue", "2026-11-17", "tempo", 10)], run);
  assert.equal(tie.get("tue"), "wed");
  assert.equal(tie.has("thu"), false);
  // A run counts for only one session, a session for only one run.
  const two = matchPlan(
    [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "tempo", 10)],
    [typedRun("wed", "2026-11-18", "tempo", 10), typedRun("wed2", "2026-11-18", "tempo", 10)],
  );
  assert.equal(two.size, 2);
  assert.notEqual(two.get("tue"), two.get("thu"));
});

test("the same-day run takes precedence and no session already done is lost", () => {
  // Tuesday a skipped tempo; Wednesday an easy run planned and a tempo done: it's Wednesday's easy run.
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("wed", "2026-11-18", "easy", 8)];
  const match = matchPlan(plan, [typedRun("run", "2026-11-18", "tempo", 10)]);
  assert.equal(match.get("wed"), "run");
  assert.equal(match.has("tue"), false);
  // Tuesday's tempo done on Tuesday stays its own even with another tempo on Wednesday.
  const done = matchPlan(
    [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "tempo", 10)],
    [typedRun("t", "2026-11-17", "tempo", 10), typedRun("w", "2026-11-18", "tempo", 10)],
  );
  assert.equal(done.get("tue"), "t");
  assert.equal(done.get("thu"), "w");
});

test("a paused session doesn't take another day's run", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10, { status: "skipped" })];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "tempo", 10)]).size, 0);
});

test("stable matching with a wider window and session for the run page", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("sat", "2026-11-21", "long", 16)];
  const runs = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const wide = [...plan, session("fri-next", "2026-11-27", "tempo", 10)];
  assert.equal(matchPlan(plan, runs).get("tue"), matchPlan(wide, [...runs, typedRun("thu-next", "2026-11-26", "tempo", 10)]).get("tue"));
  assert.equal(planWorkoutForActivity("wed", plan, runs)?.id, "tue");
});

test("plan: the moved session counts as done and counts in adherence", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "easy", 6)];
  const runs = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const days = buildDays("2026-11-16", 4, "2026-11-20", plan, runs);
  const [mon, tue, wed, thu] = days;
  assert.equal(mon.state, "rest");
  assert.equal(tue.state, "done");
  assert.equal(tue.doneOn.tue.date, "2026-11-18");
  assert.equal(wed.state, "extra");
  assert.equal(wed.countsFor.wed, "2026-11-17");
  assert.equal(thu.state, "missed");
  assert.deepEqual(adherence(days.map((day) => day.state)), { done: 1, due: 2 });
});

test("window edges: a run without its sessions loaded isn't taken", () => {
  // Shown 17-18 (window 13-22): the run on the 23rd has its sessions outside the window.
  const plan = [session("edge", "2026-11-21", "tempo", 10)];
  const runs = [typedRun("out", "2026-11-23", "tempo", 10)];
  const [day] = buildDays("2026-11-17", 2, "2026-11-25", plan, runs);
  assert.equal(day.state, "rest");
  assert.equal(withinWindow(runs, { from: "2026-11-13", to: "2026-11-22" }).length, 0);
});
